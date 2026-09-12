import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AppEnv } from "../../types/hono";
import { validateBody, validateQuery } from "../../middleware/validate";
import {
  listTasksAsRecipient,
  getTaskAsRecipient,
  cancelTaskAsRecipient,
  updateTaskStatus,
  addTaskMessage,
  addTaskArtifact,
} from "../../services/a2a-mailbox.service";
import { taskEventChannel } from "../../services/a2a-delivery.service";
import { getSubscriber } from "../../lib/redis";
import {
  taskStateSchema,
  taskStatusSchema,
  messageSchema,
  artifactSchema,
  type TaskStatus,
  type Message,
  type Artifact,
} from "../../lib/a2a";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { apiError } from "../../validators/response.helpers";
import {
  a2aTaskResponse,
  a2aTaskListResponse,
  a2aMessageResponse,
  a2aArtifactResponse,
} from "../../validators/a2a.responses";

/**
 * The owner of an A2A mailbox. The authenticated agent IS the recipient: every
 * operation is scoped by its id, so another agent can never read, update or
 * cancel a task that was not addressed to it. This mirrors the sender-facing
 * surface, where getTaskAsSender guards the same way.
 */
const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/a2a", tag: "a2a" });

// Every owner route sits behind the agent auth wall and the agent rate limit,
// so 401 and 429 are possible on all of them.
const authAndRateLimitErrors = {
  401: res(apiError, "The request is missing or has an invalid API key."),
  429: res(apiError, "Too many requests from this agent."),
};

const listTasksQuerySchema = z.object({
  contextId: z.string().optional(),
  state: taskStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const sseResponseSchema = z.object({
  data: z.record(z.unknown()).optional(),
});

const taskIdParams = z.object({ id: z.string().uuid() });

app.get(
  "/tasks",
  {
    summary: "List the mailbox of the authenticated agent",
    description: "Tasks addressed to this agent, newest first. The agent can filter by context, state, and paginate.",
    query: listTasksQuerySchema,
    responses: {
      ...authAndRateLimitErrors,
      200: res(a2aTaskListResponse, "The tasks addressed to this agent."),
      422: res(apiError, "The query parameters failed validation."),
    },
  },
  validateQuery(listTasksQuerySchema),
  async (c) => {
    const tasks = await listTasksAsRecipient(c.get("agentId"), c.get("validatedQuery"));
    return c.json({ data: tasks });
  },
);

app.get(
  "/tasks/:id",
  {
    summary: "Get one task from the mailbox",
    description: "Returns the task, its messages and its artifacts. 403 when the task is addressed to another agent.",
    params: taskIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(a2aTaskResponse, "The task, with messages and artifacts."),
      404: res(apiError, "No such task."),
      403: res(apiError, "The task is not addressed to this agent."),
    },
  },
  async (c) => {
    const task = await getTaskAsRecipient(c.req.param("id") ?? "", c.get("agentId"));
    return c.json({ data: task });
  },
);

app.post(
  "/tasks/:id/cancel",
  {
    summary: "Cancel a task in the mailbox",
    description: "Moves the task to canceled. Returns 403 when the task is addressed to another agent.",
    params: taskIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(a2aTaskResponse, "The canceled task."),
      404: res(apiError, "No such task."),
      403: res(apiError, "The task is not addressed to this agent."),
      409: res(apiError, "The task is already in a terminal state."),
    },
  },
  async (c) => {
    const task = await cancelTaskAsRecipient(c.req.param("id") ?? "", c.get("agentId"));
    return c.json({ data: task });
  },
);

app.post(
  "/tasks/:id/status",
  {
    summary: "Update the status of a task in the mailbox",
    description: "Reports progress (working, input_required, completed, failed, ...) back to the sending agent.",
    body: taskStatusSchema,
    params: taskIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(a2aTaskResponse, "The updated task."),
      403: res(apiError, "The task is not addressed to this agent."),
      409: res(apiError, "The task is already in a terminal state."),
      422: res(apiError, "The status failed validation."),
    },
  },
  validateBody(taskStatusSchema),
  async (c) => {
    const task = await updateTaskStatus(c.get("agentId"), c.req.param("id") ?? "", c.get("validatedBody") as TaskStatus);
    return c.json({ data: task });
  },
);

app.post(
  "/tasks/:id/messages",
  {
    summary: "Append a message to a task",
    description: "The recipient answers the sender inside the task thread.",
    body: messageSchema,
    params: taskIdParams,
    responses: {
      ...authAndRateLimitErrors,
      201: res(a2aMessageResponse, "The stored message."),
      403: res(apiError, "The task is not addressed to this agent."),
      409: res(apiError, "The task is already in a terminal state."),
      422: res(apiError, "The message failed validation."),
    },
  },
  validateBody(messageSchema),
  async (c) => {
    const message = await addTaskMessage(c.get("agentId"), c.req.param("id") ?? "", c.get("validatedBody") as Message);
    return c.json({ data: message }, 201);
  },
);

app.post(
  "/tasks/:id/artifacts",
  {
    summary: "Attach an artifact to a task",
    description: "The recipient delivers its work: files, specs, generated code — anything expressible as parts.",
    body: artifactSchema,
    params: taskIdParams,
    responses: {
      ...authAndRateLimitErrors,
      201: res(a2aArtifactResponse, "The stored artifact."),
      403: res(apiError, "The task is not addressed to this agent."),
      409: res(apiError, "The task is already in a terminal state."),
      422: res(apiError, "The artifact failed validation."),
    },
  },
  validateBody(artifactSchema),
  async (c) => {
    const artifact = await addTaskArtifact(c.get("agentId"), c.req.param("id") ?? "", c.get("validatedBody") as Artifact);
    return c.json({ data: artifact }, 201);
  },
);

app.get(
  "/tasks/:id/stream",
  {
    summary: "Stream updates for one mailbox task",
    description: "Server-sent events for status and artifact updates on a task addressed to this agent.",
    params: taskIdParams,
    responses: {
      ...authAndRateLimitErrors,
      200: res(sseResponseSchema, "A text/event-stream of task_status and task_artifact events."),
      403: res(apiError, "The task is not addressed to this agent."),
      404: res(apiError, "No such task."),
    },
  },
  async (c) => {
    const taskId = c.req.param("id") ?? "";
    await getTaskAsRecipient(taskId, c.get("agentId"));

    const sub = getSubscriber();
    const channelName = taskEventChannel(taskId);

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    return streamSSE(c, async (stream) => {
      await sub.subscribe(channelName);

      let closed = false;
      let resolve!: () => void;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        sub.off("message", onMessage);
        sub.unsubscribe(channelName).catch(() => {});
        resolve();
      };

      const onMessage = (channel: string, message: string) => {
        if (channel !== channelName) return;
        try {
          const envelope = JSON.parse(message) as { event?: string; payload?: unknown };
          stream.writeSSE({
            event: envelope.event ?? "message",
            data: JSON.stringify(envelope.payload ?? {}),
          }).catch(() => {});
        } catch {
          // A malformed message on the channel is not a reason to drop the stream.
        }
      };

      sub.on("message", onMessage);
      stream.onAbort(cleanup);

      await new Promise<void>((r) => {
        resolve = r;
      });
    });
  },
);

// The bare Hono, not the documented() facade — app.route(...) needs a real
// Hono instance to mount.
export default hono;