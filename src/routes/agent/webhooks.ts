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
import { idempotency } from "../../middleware/idempotency";
import { z } from "zod";
import { documented } from "../../openapi/documented";
import { uuidParam } from "../../validators/common.validators";
import {
  webhookCreateResponse,
  webhookListResponse,
  webhookUpdateResponse,
  webhookRotateSecretResponse,
  webhookDeleteResponse,
} from "../../validators/webhook.responses";
import { apiError } from "../../validators/response.helpers";

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default(["*"]),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/webhooks", tag: "webhooks" });

app.post(
  "/",
  {
    summary: "Register a webhook",
    description: "The response carries the signing secret in clear, once — it is stored sealed and never returned again.",
    body: createWebhookSchema,
    responses: { 201: webhookCreateResponse, 403: apiError, 422: apiError },
    idempotent: true,
  },
  idempotency(),
  validateBody(createWebhookSchema),
  async (c) => {
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
  },
);

app.get(
  "/",
  {
    summary: "List webhooks",
    responses: { 200: webhookListResponse },
  },
  async (c) => {
    const agentId = c.get("agentId");
    const webhookList = await listWebhooks(agentId);
    return c.json({ data: webhookList });
  },
);

app.patch(
  "/:id",
  {
    summary: "Update a webhook",
    params: uuidParam,
    body: updateWebhookSchema,
    responses: { 200: webhookUpdateResponse, 404: apiError, 422: apiError },
  },
  validateBody(updateWebhookSchema),
  async (c) => {
    const webhookId = c.req.param("id");
    const agentId = c.get("agentId");
    const input = c.get("validatedBody");
    const webhook = await updateWebhook(webhookId, agentId, input);

    return c.json({ data: webhook });
  },
);

app.post(
  "/:id/rotate-secret",
  {
    summary: "Rotate a webhook's signing secret",
    description: "The response carries the new secret in clear, once. The previous secret keeps signing deliveries for a grace window (see retireCurrentSecret in src/services/webhook.service.ts).",
    params: uuidParam,
    responses: { 200: webhookRotateSecretResponse, 404: apiError },
    idempotent: true,
  },
  idempotency(),
  async (c) => {
    const webhookId = c.req.param("id");
    const agentId = c.get("agentId");
    const { webhook, secret } = await rotateWebhookSecret(webhookId, agentId);

    return c.json({
      data: {
        ...webhook,
        secret, // Only returned once!
      },
    });
  },
);

app.delete(
  "/:id",
  {
    summary: "Delete a webhook",
    params: uuidParam,
    responses: { 200: webhookDeleteResponse, 404: apiError },
  },
  async (c) => {
    const webhookId = c.req.param("id");
    const agentId = c.get("agentId");
    const webhook = await deleteWebhook(webhookId, agentId);
    return c.json({ data: webhook });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
