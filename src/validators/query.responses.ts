import { z } from "zod";
import { ok } from "./response.helpers";

/**
 * Read off shapeHumanQuery in src/services/query.service.ts, which is what
 * actually goes on the wire — not off the guide, which is prose and can age.
 *
 * Five fields are null unless the query has been answered, and two more depend
 * on its status; nullable() rather than optional() because the service emits
 * the key with null in it, and a client that checks `in` would be misled by
 * optional.
 */
export const queryObject = z.object({
  query_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  // The DB column is NOT NULL (src/db/schema/human-queries.ts), unlike the
  // brief's initial guess — every query has a query message from creation.
  query_message_id: z.string().uuid(),
  status: z.enum(["pending", "answered", "needs_context", "expired", "cancelled"]),
  status_description: z.string(),
  query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"]),
  question: z.string(),
  context: z.string().nullable(),
  confidence: z.number().nullable(),
  subject: z.object({
    id: z.string(),
    label: z.string(),
    uri: z.string().optional(),
    body: z.string().optional(),
  }),
  self_contained: z.boolean(),
  changes: z
    .array(
      z.object({
        path: z.string(),
        before: z.string(),
        after: z.string(),
        materiality: z.enum(["material", "cosmetic"]),
      }),
    )
    .nullable(),
  risk: z.enum(["low", "medium", "high", "critical"]),
  answer_space: z.record(z.unknown()),
  language: z.enum(["en", "es", "ca"]),
  insufficient_reason: z.string().nullable(),
  answer: z.record(z.unknown()).nullable(),
  comment: z.string().nullable(),
  human_confidence: z.number().nullable(),
  response_time_ms: z.number().int().nullable(),
  prior_decision_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
});

export const queryResponse = ok(queryObject);

/**
 * What POST /api/v1/agent/queries actually returns: createQuery's own return
 * value (src/services/query.service.ts), not shapeHumanQuery. The two are
 * unrelated shapes — creation gives back a receipt (id, status, where things
 * stand, what to do next), not the full query record shapeHumanQuery renders
 * for the human's side of the chat. Documenting queryObject here instead would
 * describe a response this endpoint never sends; tests/integration/agent-queries.test.ts
 * parses the real 201 body against this schema, so a drift between this and
 * createQuery's return fails there rather than only in the document.
 */
export const createQueryResultObject = z.object({
  query_id: z.string().uuid(),
  status: z.enum(["pending", "assigned"]),
  conversation_id: z.string().uuid(),
  message: z.string(),
  next_step: z.string(),
  expires_at: z.string().datetime(),
});

export const createQueryResponse = ok(createQueryResultObject);
