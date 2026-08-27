import { z } from "zod";
import { ok } from "./response.helpers";

/**
 * Read off PublicWebhook / publicColumns in src/services/webhook.service.ts —
 * every column of the webhooks table except `secrets`, which never leaves
 * that file. lastDeliveryAt is nullable because it starts NULL and is only
 * ever set by a successful delivery.
 */
export const webhookObject = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  url: z.string(),
  events: z.array(z.string()),
  isActive: z.boolean(),
  failureCount: z.number().int(),
  lastDeliveryAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * POST / and POST /:id/rotate-secret both spread the webhook row and add
 * `secret` in clear — the plaintext exists for exactly this one response;
 * only its sealed form (src/lib/secret-box.ts) is stored. Documented
 * separately from webhookObject rather than reused, since GET/PATCH/DELETE
 * never carry a secret at all — tests/integration/webhook-signature.test.ts's
 * "never returns secret material from list, update or delete" asserts
 * exactly that split.
 */
export const webhookCreateResponse = ok(webhookObject.extend({ secret: z.string() }));
export const webhookRotateSecretResponse = ok(webhookObject.extend({ secret: z.string() }));

export const webhookListResponse = ok(z.array(webhookObject));
export const webhookUpdateResponse = ok(webhookObject);
export const webhookDeleteResponse = ok(webhookObject);
