import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/hono";
import { a2aSenderAuth, a2aResolveRecipient } from "../../middleware/a2a-auth";
import { validateBody, validateQuery } from "../../middleware/validate";
import {
  sendMessage,
  getTaskAsSender,
  listTasksAsSender,
  cancelTaskAsSender,
} from "../../services/a2a-mailbox.service";
import {
  sendMessageRequestSchema,
  taskStateSchema,
  type SendMessageRequest,
} from "../../lib/a2a";

const hono = new Hono<AppEnv>();

// Every A2A request is sent by one registered agent and addressed to another.
// Auth first, then resolve the recipient so an unauthenticated caller learns
// nothing about whether a slug exists.
hono.use("*", a2aSenderAuth);
hono.use("*", a2aResolveRecipient);

const listTasksQuerySchema = z.object({
  contextId: z.string().optional(),
  state: taskStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

hono.post("/message:send", validateBody(sendMessageRequestSchema), async (c) => {
  const request = c.get("validatedBody") as SendMessageRequest;
  const senderId = c.get("a2aSenderAgentId");
  const recipientId = c.get("a2aRecipientAgentId");

  const task = await sendMessage(recipientId, senderId, request);
  return c.json(task, 200);
});

hono.get("/tasks/:id", async (c) => {
  const taskId = c.req.param("id") ?? "";
  const task = await getTaskAsSender(taskId, c.get("a2aSenderAgentId"));
  return c.json(task);
});

hono.get("/tasks", validateQuery(listTasksQuerySchema), async (c) => {
  const query = c.get("validatedQuery");
  const tasks = await listTasksAsSender(c.get("a2aSenderAgentId"), query);
  return c.json(tasks);
});

// The A2A spec's cancel path is POST /tasks/{id}:cancel. Hono parses the
// trailing ":cancel" as part of the parameter name (a param matches [^/]+),
// so the id arrives as "id:cancel" and is stripped here.
hono.post("/tasks/:id:cancel", async (c) => {
  const raw = c.req.param("id:cancel") ?? "";
  const taskId = raw.replace(/:cancel$/, "");
  const task = await cancelTaskAsSender(taskId, c.get("a2aSenderAgentId"));
  return c.json(task);
});

export default hono;