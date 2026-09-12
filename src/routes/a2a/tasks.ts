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
  createPushConfig,
  getPushConfig,
  listPushConfigs,
  deletePushConfig,
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

const pushConfigSchema = z.object({
  url: z.string().url(),
  authInfo: z.record(z.unknown()).optional(),
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

hono.post("/tasks/:id:cancel", async (c) => {
  const taskId = c.req.param("id") ?? "";
  const task = await cancelTaskAsSender(taskId, c.get("a2aSenderAgentId"));
  return c.json(task);
});

hono.post("/tasks/:id/push-configs", validateBody(pushConfigSchema), async (c) => {
  const { url, authInfo } = c.get("validatedBody") as { url: string; authInfo?: Record<string, unknown> };
  const config = await createPushConfig(c.req.param("id") ?? "", c.get("a2aSenderAgentId"), url, authInfo);
  return c.json(config, 201);
});

hono.get("/tasks/:id/push-configs", async (c) => {
  const configs = await listPushConfigs(c.req.param("id") ?? "", c.get("a2aSenderAgentId"));
  return c.json(configs);
});

hono.get("/tasks/:id/push-configs/:configId", async (c) => {
  const config = await getPushConfig(
    c.req.param("id") ?? "",
    c.get("a2aSenderAgentId"),
    c.req.param("configId") ?? "",
  );
  return c.json(config);
});

hono.delete("/tasks/:id/push-configs/:configId", async (c) => {
  await deletePushConfig(
    c.req.param("id") ?? "",
    c.get("a2aSenderAgentId"),
    c.req.param("configId") ?? "",
  );
  return c.body(null, 204);
});

export default hono;