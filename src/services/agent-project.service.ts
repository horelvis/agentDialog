import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  agentProjects,
  agentProjectParticipants,
  agentProjectTasks,
  a2aTasks,
  agents,
} from "../db/schema";
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from "../lib/errors";
import { sendMessage } from "./a2a-mailbox.service";

/**
 * Distributed agent projects. The lead agent owns a project, invites
 * participants by agent id, and assigns subtasks that are delivered through the
 * A2A mailbox. The service never runs the work; it only records the assignment
 * and the lead's view of it.
 *
 * Access is the security boundary the whole feature exists around:
 * - the lead sees everything in its projects;
 * - a participant sees a project only through the tasks assigned to it.
 */

export type ProjectStatus = "active" | "paused" | "completed" | "canceled";
export type ParticipantRole = "lead" | "member";
export type ProjectTaskStatus = "pending" | "assigned" | "in_progress" | "review" | "completed" | "failed" | "canceled";

export interface CreateProjectInput {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface PublicParticipant {
  id: string;
  agentId: string;
  role: ParticipantRole;
  status: string;
  createdAt: Date;
}

export interface PublicProjectTask {
  id: string;
  a2aTaskId: string;
  title: string;
  description: string | null;
  assigneeAgentId: string;
  status: ProjectTaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string;
  participants: PublicParticipant[];
  tasks: PublicProjectTask[];
  createdAt: Date;
  updatedAt: Date;
}

const PROJECT_TASK_STATUSES: ProjectTaskStatus[] = [
  "pending",
  "assigned",
  "in_progress",
  "review",
  "completed",
  "failed",
  "canceled",
];

/**
 * How an A2A task state shows up in the project. The mailbox is the source of
 * truth for delivery; the project task status is read off the linked A2A task,
 * so a completed delivery can never leave a stale "assigned" behind.
 */
export function a2aStateToProjectTaskStatus(a2aState: string): ProjectTaskStatus {
  switch (a2aState) {
    case "working":
      return "in_progress";
    case "input_required":
      return "review";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "rejected":
      return "failed";
    default:
      return "assigned";
  }
}

/**
 * Derive the project status from its tasks' statuses. Empty projects stay
 * active; a project is completed when every task is completed; a project where
 * every task is canceled is canceled. Everything else is in flight.
 */
export function computeProjectStatus(taskStatuses: ProjectTaskStatus[]): ProjectStatus {
  if (taskStatuses.length === 0) return "active";
  if (taskStatuses.every((s) => s === "completed")) return "completed";
  if (taskStatuses.every((s) => s === "canceled")) return "canceled";
  return "active";
}

export function assertValidProjectTaskStatus(value: string): asserts value is ProjectTaskStatus {
  if (!(PROJECT_TASK_STATUSES as string[]).includes(value)) {
    throw new ValidationError(`Invalid project task status: ${value}`);
  }
}

export async function createProject(leadAgentId: string, input: CreateProjectInput): Promise<PublicProject> {
  const db = getDb();

  const [project] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(agentProjects)
      .values({
        name: input.name,
        description: input.description ?? null,
        leadAgentId,
        metadata: input.metadata ?? {},
      })
      .returning();

    await tx.insert(agentProjectParticipants).values({
      projectId: created.id,
      agentId: leadAgentId,
      role: "lead",
      status: "active",
    });

    return [created];
  });

  return getProject(leadAgentId, project.id);
}

/**
 * Resolve the agent a caller means, from either its id or its slug. A slug is
 * the name the agent registered with — the same one in its agent card URL — so
 * a lead can invite a peer without copying UUIDs around. Exactly one of the two
 * must be given.
 */
export async function resolveAgentRef(ref: { agentId?: string; agentSlug?: string }): Promise<string> {
  const hasId = typeof ref.agentId === "string" && ref.agentId.length > 0;
  const hasSlug = typeof ref.agentSlug === "string" && ref.agentSlug.length > 0;

  if (hasId === hasSlug) {
    throw new ValidationError("Provide exactly one of agent_id or agent_slug");
  }
  if (hasId) return ref.agentId as string;

  const db = getDb();
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, ref.agentSlug as string))
    .limit(1);

  if (!agent) throw new NotFoundError("Agent", ref.agentSlug as string);
  return agent.id;
}

export async function inviteParticipant(
  leadAgentId: string,
  projectId: string,
  agentId: string,
  role: ParticipantRole = "member",
): Promise<PublicParticipant> {
  const project = await fetchProjectRow(projectId);
  assertLead(project, leadAgentId);

  if (project.leadAgentId === agentId) {
    throw new ValidationError("The lead agent is already a participant");
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(agentProjectParticipants)
    .where(
      and(
        eq(agentProjectParticipants.projectId, projectId),
        eq(agentProjectParticipants.agentId, agentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(agentProjectParticipants)
      .set({ role, status: "active", updatedAt: new Date() })
      .where(eq(agentProjectParticipants.id, existing[0]!.id))
      .returning();
    return publicParticipant(row);
  }

  const [row] = await db
    .insert(agentProjectParticipants)
    .values({ projectId, agentId, role, status: "active" })
    .returning();

  return publicParticipant(row);
}

export async function createTask(
  leadAgentId: string,
  projectId: string,
  assigneeAgentId: string,
  title: string,
  description: string | undefined,
  message: string,
): Promise<PublicProjectTask> {
  const project = await fetchProjectRow(projectId);
  assertLead(project, leadAgentId);

  if (project.status === "canceled" || project.status === "completed") {
    throw new ConflictError(`Cannot add tasks to a ${project.status} project`);
  }

  await assertActiveParticipant(projectId, assigneeAgentId);

  // The delivery happens through the mailbox: the lead sends a task to the
  // assignee, then records the assignment in the project.
  const task = await sendMessage(assigneeAgentId, leadAgentId, {
    message: { role: "user", parts: [{ kind: "text", text: message }] },
    metadata: { projectId, title },
  });

  const db = getDb();
  const [row] = await db
    .insert(agentProjectTasks)
    .values({
      projectId,
      a2aTaskId: task.id,
      title,
      description: description ?? null,
      assigneeAgentId,
      status: "assigned",
    })
    .returning();

  return publicProjectTask(row);
}

export async function getProject(leadAgentId: string, projectId: string): Promise<PublicProject> {
  const project = await fetchProjectRow(projectId);
  assertLead(project, leadAgentId);
  return buildProject(project);
}

/**
 * The right view of a project for whoever calls: the lead sees everything, a
 * participant sees only its own tasks, and an outsider gets 403.
 */
export async function getProjectForAgent(agentId: string, projectId: string): Promise<PublicProject> {
  const project = await fetchProjectRow(projectId);
  if (project.leadAgentId === agentId) return buildProject(project);
  return getProjectAsParticipant(agentId, projectId);
}

/**
 * The participant's view of a project: only the tasks assigned to this agent.
 * The lead's view, getProject, shows everything.
 */
export async function getProjectAsParticipant(agentId: string, projectId: string): Promise<PublicProject> {
  const project = await fetchProjectRow(projectId);
  if (project.leadAgentId === agentId) return buildProject(project);

  await assertActiveParticipant(projectId, agentId);

  const db = getDb();
  const tasks = await db
    .select()
    .from(agentProjectTasks)
    .where(
      and(
        eq(agentProjectTasks.projectId, projectId),
        eq(agentProjectTasks.assigneeAgentId, agentId),
      ),
    )
    .orderBy(asc(agentProjectTasks.createdAt));

  const participants = await fetchParticipants(projectId);
  const filtered = participants.filter((p) => p.agentId === agentId);

  const liveStatuses = await projectTaskStatuses(tasks);
  const liveTasks = tasks.map((t, i) => ({ ...publicProjectTask(t), status: liveStatuses[i] ?? t.status as ProjectTaskStatus }));

  return {
    ...projectToPublic(project),
    participants: filtered,
    tasks: liveTasks,
  };
}

export async function listProjects(leadAgentId: string): Promise<PublicProject[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentProjects)
    .where(eq(agentProjects.leadAgentId, leadAgentId))
    .orderBy(desc(agentProjects.createdAt));

  const results: PublicProject[] = [];
  for (const row of rows) {
    results.push(await buildProject(row));
  }
  return results;
}

/**
 * Every project an agent can see: those it leads, and those where it is an
 * active participant. The participant view only carries its own tasks.
 */
export async function listProjectsForAgent(agentId: string): Promise<PublicProject[]> {
  const db = getDb();

  const memberships = await db
    .select()
    .from(agentProjectParticipants)
    .where(eq(agentProjectParticipants.agentId, agentId));

  const results: PublicProject[] = [];
  for (const membership of memberships) {
    const project = await fetchProjectRow(membership.projectId);
    if (project.leadAgentId === agentId) {
      results.push(await buildProject(project));
    } else {
      results.push(await getProjectAsParticipant(agentId, project.id));
    }
  }
  return results;
}

export async function cancelProject(leadAgentId: string, projectId: string): Promise<PublicProject> {
  const project = await fetchProjectRow(projectId);
  assertLead(project, leadAgentId);

  if (project.status === "canceled") {
    throw new ConflictError("Project is already canceled");
  }

  const db = getDb();
  await db
    .update(agentProjects)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(agentProjects.id, projectId));

  return getProject(leadAgentId, projectId);
}

async function fetchProjectRow(projectId: string) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(agentProjects)
    .where(eq(agentProjects.id, projectId))
    .limit(1);

  if (!project) throw new NotFoundError("Project", projectId);
  return project;
}

function assertLead(project: typeof agentProjects.$inferSelect, leadAgentId: string) {
  if (project.leadAgentId !== leadAgentId) {
    throw new ForbiddenError("Only the project lead can do this");
  }
}

async function assertActiveParticipant(projectId: string, agentId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentProjectParticipants)
    .where(
      and(
        eq(agentProjectParticipants.projectId, projectId),
        eq(agentProjectParticipants.agentId, agentId),
        eq(agentProjectParticipants.status, "active"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new ForbiddenError("Agent is not an active participant of this project");
  }
}

async function fetchParticipants(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(agentProjectParticipants)
    .where(eq(agentProjectParticipants.projectId, projectId))
    .orderBy(asc(agentProjectParticipants.createdAt));
}

async function fetchTasks(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(agentProjectTasks)
    .where(eq(agentProjectTasks.projectId, projectId))
    .orderBy(asc(agentProjectTasks.createdAt));
}

async function buildProject(project: typeof agentProjects.$inferSelect): Promise<PublicProject> {
  const [participants, tasks] = await Promise.all([
    fetchParticipants(project.id),
    fetchTasks(project.id),
  ]);

  const statuses = await projectTaskStatuses(tasks);

  // An explicitly canceled project stays canceled whatever its tasks say; the
  // derived status is only the fallback for projects never moved by hand.
  const derived = computeProjectStatus(statuses);
  const status = project.status === "canceled" ? "canceled" : derived;

  const liveTasks = tasks.map((t, i) => ({
    ...publicProjectTask(t),
    status: statuses[i] ?? t.status as ProjectTaskStatus,
  }));

  return {
    ...projectToPublic(project),
    status,
    participants: participants.map(publicParticipant),
    tasks: liveTasks,
  };
}

/**
 * The live status of every project task, read from its linked A2A task. The
 * stored `status` column is the initial value; delivery progress lives in the
 * mailbox, so that is what is shown.
 */
async function projectTaskStatuses(tasks: Array<typeof agentProjectTasks.$inferSelect>): Promise<ProjectTaskStatus[]> {
  if (tasks.length === 0) return [];

  const db = getDb();
  const a2aRows = await db
    .select({ id: a2aTasks.id, state: a2aTasks.state })
    .from(a2aTasks)
    .where(inArray(a2aTasks.id, tasks.map((t) => t.a2aTaskId)));

  const stateById = new Map(a2aRows.map((r) => [r.id, r.state]));
  return tasks.map((t) => a2aStateToProjectTaskStatus(stateById.get(t.a2aTaskId) ?? "submitted"));
}

function projectToPublic(project: typeof agentProjects.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status as ProjectStatus,
    leadAgentId: project.leadAgentId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function publicParticipant(row: typeof agentProjectParticipants.$inferSelect): PublicParticipant {
  return {
    id: row.id,
    agentId: row.agentId,
    role: row.role as ParticipantRole,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function publicProjectTask(row: typeof agentProjectTasks.$inferSelect): PublicProjectTask {
  return {
    id: row.id,
    a2aTaskId: row.a2aTaskId,
    title: row.title,
    description: row.description,
    assigneeAgentId: row.assigneeAgentId,
    status: row.status as ProjectTaskStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}