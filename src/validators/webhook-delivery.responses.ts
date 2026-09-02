import { z } from "zod";

/**
 * The real event names, read off dispatchWebhooks's call sites rather than
 * the guide, which drifts: src/routes/agent/messages.ts,
 * src/routes/agent/upload.ts and src/routes/human/messages.ts dispatch
 * "message.new"; query.service.ts dispatches "query.needs_context" and
 * "query.answered". Exported so src/routes/agent/webhooks.ts (the request
 * side, subscribing to a subset) and webhook.responses.ts (the response
 * side, reporting which subset a webhook is subscribed to) describe the same
 * list instead of each writing their own prose that can drift from this one.
 */
export const WEBHOOK_EVENT_NAMES = ["message.new", "query.needs_context", "query.answered"] as const;

/**
 * The body of an outbound delivery — what lands on the URL an agent
 * registered, not anything this API serves. Read off dispatchWebhooks in
 * src/services/webhook.service.ts:233 (`{ event, data, timestamp }`). `data`
 * differs by event (a message row for one, a partial query summary for the
 * other two), so it stays a record rather than a narrower per-event schema
 * this document would then have to keep in sync by hand.
 */
export const webhookDeliveryBody = z.object({
  event: z.enum(WEBHOOK_EVENT_NAMES),
  data: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});
