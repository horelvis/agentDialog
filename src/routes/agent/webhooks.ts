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
// Must be imported before the .openapi() call below runs, and this module's
// own top-level code is exactly where it runs — see the note in
// src/openapi/document.ts.
import "zod-openapi/extend";
import { z } from "zod";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { uuidParam } from "../../validators/common.validators";
import {
  webhookCreateResponse,
  webhookListResponse,
  webhookUpdateResponse,
  webhookRotateSecretResponse,
  webhookDeleteResponse,
} from "../../validators/webhook.responses";
import { WEBHOOK_EVENT_NAMES } from "../../validators/webhook-delivery.responses";
import { apiError } from "../../validators/response.helpers";

const EVENTS_DESCRIPTION =
  `The events to receive: any of ${WEBHOOK_EVENT_NAMES.map((e) => `\`${e}\``).join(", ")}, or \`"*"\` for all of them.`;

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default(["*"]).openapi({ description: EVENTS_DESCRIPTION }),
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
    responses: {
      201: res(webhookCreateResponse, "The webhook, registered. `secret` is returned in clear this one time — only its sealed form is stored."),
      403: res(apiError, "This agent already has the maximum number of webhooks registered."),
      422: res(apiError, "The request body failed validation, or `url` resolves to loopback, a private range, or a cloud metadata address."),
    },
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
    responses: { 200: res(webhookListResponse, "Webhooks registered by the authenticated agent.") },
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
    responses: {
      200: res(webhookUpdateResponse, "The webhook, updated."),
      404: res(apiError, "No such webhook, or it wasn't registered by the authenticated agent."),
      422: res(
        apiError,
        "The request body failed validation, `url` resolves to a disallowed address, or `isActive: true` was sent for a webhook with no live signing secret — rotate the secret first.",
      ),
    },
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
    description: "The response carries the new secret in clear, once. The previous secret keeps signing deliveries for a grace window before it stops working, so a receiver mid-rotation never drops a delivery.",
    params: uuidParam,
    responses: {
      200: res(webhookRotateSecretResponse, "The new secret, returned in clear this one time."),
      404: res(apiError, "No such webhook, or it wasn't registered by the authenticated agent."),
      // idempotency() calls assertValidIdempotencyKey before this route has a
      // body to blame it on — the other 422 on this surface with no doc.body.
      422: res(apiError, "The Idempotency-Key header is empty or longer than 255 characters."),
    },
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
    responses: {
      200: res(webhookDeleteResponse, "The webhook, deleted."),
      404: res(apiError, "No such webhook, or it wasn't registered by the authenticated agent."),
    },
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
