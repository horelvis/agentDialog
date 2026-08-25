import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  rotateWebhookSecret,
} from "../../services/webhook.service";
import { validateBody } from "../../middleware/validate";
import { z } from "zod";

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default(["*"]),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

const app = new Hono<AppEnv>();

app.post("/", validateBody(createWebhookSchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const { webhook, secret } = await createWebhook(agentId, input);

  return c.json(
    {
      data: {
        ...webhook,
        secret, // Only returned once!
      },
    },
    201,
  );
});

app.get("/", async (c) => {
  const agentId = c.get("agentId");
  const webhookList = await listWebhooks(agentId);
  return c.json({ data: webhookList });
});

app.patch("/:id", validateBody(updateWebhookSchema), async (c) => {
  const webhookId = c.req.param("id");
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const webhook = await updateWebhook(webhookId, agentId, input);

  return c.json({ data: webhook });
});

app.post("/:id/rotate-secret", async (c) => {
  const webhookId = c.req.param("id");
  const agentId = c.get("agentId");
  const { webhook, secret } = await rotateWebhookSecret(webhookId, agentId);

  return c.json({
    data: {
      ...webhook,
      secret, // Only returned once!
    },
  });
});

app.delete("/:id", async (c) => {
  const webhookId = c.req.param("id");
  const agentId = c.get("agentId");
  const webhook = await deleteWebhook(webhookId, agentId);
  return c.json({ data: webhook });
});

export default app;
