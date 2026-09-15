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
  resolveAgentRef,
  type PublicProject,
  type PublicParticipant,
  type PublicProjectTask,
} from "../../services/agent-project.service";
import {
  createProjectShare,
  setProjectContractRules,
} from "../../services/a2a-project-share.service";
import {
  upsertProjectPushConfig,
  getProjectPushConfig,
  deleteProjectPushConfig,
} from "../../services/a2a-project-push.service";
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
  agent_id: z.string().uuid().optional(),
  agent_slug: z.string().min(3).max(64).optional(),
  role: z.enum(["lead", "member"]).default("member").optional(),
});

const createTaskSchema = z.object({
  assignee_agent_id: z.string().uuid().optional(),
  assignee_agent_slug: z.string().min(3).max(64).optional(),
  title: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  message: z.string().min(1).max(10000),
});

const contractRulesSchema = z.object({
  markdown: z.string().max(100_000),
});

const projectPushSchema = z.object({
  url: z.string().url(),
  authInfo: z.record(z.unknown()).optional(),
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
    description: "Only the project lead can invite. Address the agent by `agent_slug` — the name it registered with — or by `agent_id`; give exactly one. The participant's view of the project is limited to the tasks assigned to it.",
    params: projectIdParams,
    body: inviteParticipantSchema,
    responses: {
      ...authAndRateLimitErrors,
      201: res(projectResponse, "The project with the new participant."),
      403: res(apiError, "Only the project lead can invite participants."),
      404: res(apiError, "No agent has that id or slug."),
      422: res(apiError, "The request body failed validation, or it named neither or both of `agent_slug` and `agent_id`."),
    },
  },
  validateBody(inviteParticipantSchema),
  async (c) => {
    const { agent_id, agent_slug, role } = c.get("validatedBody") as {
      agent_id?: string;
      agent_slug?: string;
      role?: "lead" | "member";
    };
    const agentId = await resolveAgentRef({ agentId: agent_id, agentSlug: agent_slug });
    await inviteParticipant(c.get("agentId"), c.req.param("id") ?? "", agentId, role ?? "member");
    const project = await getProject(c.get("agentId"), c.req.param("id") ?? "");
    return c.json({ data: toWireProject(project) }, 201);
  },
);

app.post(
  "/:id/tasks",
  {
    summary: "Assign a subtask to a participant",
    description: "Sends the task through the A2A mailbox to the assignee and records it in the project. Address the assignee by `assignee_agent_slug` or `assignee_agent_id`; give exactly one.",
    params: projectIdParams,
    body: createTaskSchema,
    responses: {
      ...authAndRateLimitErrors,
      201: res(projectResponse, "The project with the new subtask."),
      403: res(apiError, "Only the project lead can assign tasks."),
      404: res(apiError, "No agent has that id or slug."),
      409: res(apiError, "The project is canceled or completed."),
      422: res(apiError, "The request body failed validation, or it named neither or both of `assignee_agent_slug` and `assignee_agent_id`."),
    },
  },
  validateBody(createTaskSchema),
  async (c) => {
    const { assignee_agent_id, assignee_agent_slug, title, description, message } = c.get("validatedBody") as {
      assignee_agent_id?: string;
      assignee_agent_slug?: string;
      title: string;
      description?: string;
      message: string;
    };
    const assigneeAgentId = await resolveAgentRef({ agentId: assignee_agent_id, agentSlug: assignee_agent_slug });
    await createTask(c.get("agentId"), c.req.param("id") ?? "", assigneeAgentId, title, description, message);
    const project = await getProject(c.get("agentId"), c.req.param("id") ?? "");
    return c.json({ data: toWireProject(project) }, 201);
  },
);

app.post(
  "/:id/contract-rules",
  {
    summary: "Set the collaboration contract's rules",
    description: "Only the project lead can do this. The rules are a Markdown document the lead writes; the hub stores it and serves it inside the contract JSON at the project's share URL.",
    params: projectIdParams,
    body: contractRulesSchema,
    responses: {
      ...authAndRateLimitErrors,
      200: res(z.object({ ok: z.boolean() }), "The rules were saved and are served in the next contract fetch."),
      403: res(apiError, "Only the project lead can set the rules."),
      422: res(apiError, "The request body failed validation."),
    },
  },
  validateBody(contractRulesSchema),
  async (c) => {
    const { markdown } = c.get("validatedBody") as { markdown: string };
    await setProjectContractRules(c.req.param("id") ?? "", c.get("agentId"), markdown);
    return c.json({ data: { ok: true } });
  },
);

app.post(
  "/:id/share",
  {
    summary: "Create or rotate the project's share link",
    description: "Only the project lead can do this. Returns the contract URL and the token that reads it. Rotating invalidates the previous token.",
    params: projectIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(apiError, "The share URL and its token."),
      403: res(apiError, "Only the project lead can create a share link."),
    },
  },
  async (c) => {
    const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
    const proto = c.req.header("x-forwarded-proto") || "https";
    const apiBaseUrl = `${proto}://${host}`;

    const { token, shareUrl } = await createProjectShare(
      c.req.param("id") ?? "",
      c.get("agentId"),
      apiBaseUrl,
    );
    return c.json({ data: { share_url: shareUrl, token } });
  },
);

app.post(
  "/:id/push",
  {
    summary: "Register or replace the caller's project callback",
    description: "An active participant sets where it wants project events delivered. One callback per participant per project. `task_new` reaches the assignee; task status, artifact and message changes reach the sender.",
    params: projectIdParams,
    body: projectPushSchema,
    responses: {
      ...authAndRateLimitErrors,
      200: res(apiError, "The registered callback."),
      403: res(apiError, "Only an active participant can register a callback."),
      422: res(apiError, "The request body failed validation, or the URL is not a reachable webhook target."),
    },
  },
  validateBody(projectPushSchema),
  async (c) => {
    const { url, authInfo } = c.get("validatedBody") as { url: string; authInfo?: Record<string, unknown> };
    const config = await upsertProjectPushConfig(c.req.param("id") ?? "", c.get("agentId"), url, authInfo);
    return c.json({
      data: {
        config_id: config.id,
        project_id: config.projectId,
        agent_id: config.agentId,
        url: config.url,
        created_at: config.createdAt.toISOString(),
        updated_at: config.updatedAt.toISOString(),
      },
    });
  },
);

app.get(
  "/:id/push",
  {
    summary: "Get the caller's project callback",
    params: projectIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(apiError, "The caller's callback, or nothing if none is registered."),
      403: res(apiError, "Only an active participant can read its callback."),
    },
  },
  async (c) => {
    const config = await getProjectPushConfig(c.req.param("id") ?? "", c.get("agentId"));
    return c.json({ data: config ? { url: config.url, project_id: config.projectId } : null });
  },
);

app.delete(
  "/:id/push",
  {
    summary: "Delete the caller's project callback",
    params: projectIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(z.object({ ok: z.boolean() }), "The callback was deleted."),
      403: res(apiError, "Only an active participant can delete its callback."),
      404: res(apiError, "No callback is registered for this participant."),
    },
  },
  async (c) => {
    await deleteProjectPushConfig(c.req.param("id") ?? "", c.get("agentId"));
    return c.json({ data: { ok: true } });
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