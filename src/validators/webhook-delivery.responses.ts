import { z } from "zod";

/**
 * The body of an outbound delivery — what lands on the URL an agent
 * registered, not anything this API serves. Read off dispatchWebhooks in
 * src/services/webhook.service.ts:233 (`{ event, data, timestamp }`), and the
 * event names off its call sites rather than the guide, which drifts:
 * src/routes/agent/messages.ts, src/routes/agent/upload.ts and
 * src/routes/human/messages.ts dispatch "message.new"; query.service.ts
 * dispatches "query.needs_context" and "query.answered". `data` differs by
 * event (a message row for one, a partial query summary for the other two),
 * so it stays a record rather than a narrower per-event schema this document
 * would then have to keep in sync by hand.
 */
export const webhookDeliveryBody = z.object({
  event: z.enum(["message.new", "query.needs_context", "query.answered"]),
  data: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});
