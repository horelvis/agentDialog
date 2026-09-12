import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/hono";
import { validateBody } from "../../middleware/validate";
import {
  createProject,
  inviteParticipant,
  createTask,
  getProjectForAgent,
  getProject,
  listProjects,
  cancelProject,
  type PublicProject,
  type PublicParticipant,
  type PublicProjectTask,
} from "../../services/agent-project.service";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { apiError } from "../../validators/response.helpers";
import {
  projectResponse,
  projectListResponse,
} from "../../validators/project.responses";

/**
 * Distributed agent projects. The wire shape is snake_case, following the
 * queries resource convention; the service speaks camelCase and this module
 * translates at the edge. Only the project lead may create, invite, assign or
 * cancel; a participant reads a project only through the tasks assigned to it.
 */
const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/projects", tag: "projects" });

const authAndRateLimitErrors = {
  401: res(apiError, "The request is missing or has an invalid API key."),
  429: res(apiError, "Too many requests from this agent."),
};

const createProjectSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const inviteParticipantSchema = z.object({
  agent_id: z.string().uuid(),
  role: z.enum(["lead", "member"]).default("member").optional(),
});

const createTaskSchema = z.object({
  assignee_agent_id: z.string().uuid(),
  title: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  message: z.string().min(1).max(10000),
});

const projectIdParams = z.object({ id: z.string().uuid() });

function toWireProject(project: PublicProject) {
  return {
    project_id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    lead_agent_id: project.leadAgentId,
    participants: project.participants.map(toWireParticipant),
    tasks: project.tasks.map(toWireTask),
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}

function toWireParticipant(p: PublicParticipant) {
  return {
    participant_id: p.id,
    agent_id: p.agentId,
    role: p.role,
    status: p.status,
    created_at: p.createdAt.toISOString(),
  };
}

function toWireTask(t: PublicProjectTask) {
  return {
    task_id: t.id,
    a2a_task_id: t.a2aTaskId,
    title: t.title,
    description: t.description,
    assignee_agent_id: t.assigneeAgentId,
    status: t.status,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

app.post(
  "/",
  {
    summary: "Create a distributed agent project",
    description: "The authenticated agent becomes the project lead. It can then invite participants and assign subtasks.",
    body: createProjectSchema,
    responses: {
      ...authAndRateLimitErrors,
      201: res(projectResponse, "The created project, with the lead as its first participant."),
      422: res(apiError, "The request body failed validation."),
    },
  },
  validateBody(createProjectSchema),
  async (c) => {
    const { name, description, metadata } = c.get("validatedBody") as {
      name: string;
      description?: string;
      metadata?: Record<string, unknown>;
    };
    const project = await createProject(c.get("agentId"), { name, description, metadata });
    return c.json({ data: toWireProject(project) }, 201);
  },
);

app.get(
  "/",
  {
    summary: "List projects led by the authenticated agent",
    responses: {
      ...authAndRateLimitErrors,
      200: res(projectListResponse, "The projects this agent leads, newest first."),
    },
  },
  async (c) => {
    const projects = await listProjects(c.get("agentId"));
    return c.json({ data: projects.map(toWireProject) });
  },
);

app.get(
  "/:id",
  {
    summary: "Get a project",
    description: "The lead sees the project with all participants and tasks; a participant sees only the tasks assigned to it.",
    params: projectIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(projectResponse, "The project. The lead sees everything; a participant only its own tasks."),
      404: res(apiError, "No such project."),
      403: res(apiError, "The caller is neither the project lead nor a participant."),
    },
  },
  async (c) => {
    const project = await getProjectForAgent(c.get("agentId"), c.req.param("id") ?? "");
    return c.json({ data: toWireProject(project) });
  },
);

app.post(
  "/:id/participants",
  {
    summary: "Invite an agent as a participant",
    description: "Only the project lead can invite. The participant's view of the project is limited to the tasks assigned to it.",
    params: projectIdParams,
    body: inviteParticipantSchema,
    responses: {
      ...authAndRateLimitErrors,
      201: res(projectResponse, "The project with the new participant."),
      403: res(apiError, "Only the project lead can invite participants."),
      422: res(apiError, "The request body failed validation."),
    },
  },
  validateBody(inviteParticipantSchema),
  async (c) => {
    const { agent_id: agentId, role } = c.get("validatedBody") as { agent_id: string; role?: "lead" | "member" };
    await inviteParticipant(c.get("agentId"), c.req.param("id") ?? "", agentId, role ?? "member");
    const project = await getProject(c.get("agentId"), c.req.param("id") ?? "");
    return c.json({ data: toWireProject(project) }, 201);
  },
);

app.post(
  "/:id/tasks",
  {
    summary: "Assign a subtask to a participant",
    description: "Sends the task through the A2A mailbox to the assignee and records it in the project.",
    params: projectIdParams,
    body: createTaskSchema,
    responses: {
      ...authAndRateLimitErrors,
      201: res(projectResponse, "The project with the new subtask."),
      403: res(apiError, "Only the project lead can assign tasks."),
      409: res(apiError, "The project is canceled or completed."),
      422: res(apiError, "The request body failed validation."),
    },
  },
  validateBody(createTaskSchema),
  async (c) => {
    const { assignee_agent_id: assigneeAgentId, title, description, message } = c.get("validatedBody") as {
      assignee_agent_id: string;
      title: string;
      description?: string;
      message: string;
    };
    await createTask(c.get("agentId"), c.req.param("id") ?? "", assigneeAgentId, title, description, message);
    const project = await getProject(c.get("agentId"), c.req.param("id") ?? "");
    return c.json({ data: toWireProject(project) }, 201);
  },
);

app.post(
  "/:id/cancel",
  {
    summary: "Cancel a project",
    description: "Marks the project canceled. Only the project lead can do this.",
    params: projectIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(projectResponse, "The canceled project."),
      403: res(apiError, "Only the project lead can cancel the project."),
      409: res(apiError, "The project is already canceled."),
    },
  },
  async (c) => {
    const project = await cancelProject(c.get("agentId"), c.req.param("id") ?? "");
    return c.json({ data: toWireProject(project) });
  },
);

// The bare Hono, not the documented() facade — app.route(...) needs a real
// Hono instance to mount.
export default hono;