import { z } from "zod";
import { ok } from "./response.helpers";
import { queryStatusEnum, queryTypeEnum } from "../db/schema/enums";
import { SUPPORTED_LANGUAGES } from "../i18n";

/**
 * Read off shapeQuery in src/services/query.service.ts — what every
 * agent-facing query route returns (getQuery, updateQuery, cancelQuery) — not
 * shapeHumanQuery, which is a different, larger shape rendered only for
 * /human/* and /q/:token and carries fields an agent never receives
 * (conversation_id, query_message_id, subject, changes, risk, answer_space,
 * prior_decision_at). Documenting shapeHumanQuery here would describe a
 * response no agent endpoint sends.
 *
 * Four fields are null unless the query has been answered, and one more
 * depends on status being needs_context; nullable() rather than optional()
 * because the service emits the key with null in it, and a client that checks
 * `in` would be misled by optional.
 */
export const queryObject = z.object({
  query_id: z.string().uuid(),
  // From the enum columns themselves (src/db/schema/enums.ts), not a
  // hand-copied list — "assigned" is a real status: the human has accepted
  // the invitation but hasn't answered yet.
  status: z.enum(queryStatusEnum.enumValues),
  status_description: z.string(),
  query_type: z.enum(queryTypeEnum.enumValues),
  question: z.string(),
  context: z.string().nullable(),
  confidence: z.number().nullable(),
  language: z.enum(SUPPORTED_LANGUAGES),
  answer: z.record(z.unknown()).nullable(),
  comment: z.string().nullable(),
  human_confidence: z.number().nullable(),
  response_time_ms: z.number().int().nullable(),
  insufficient_reason: z.string().nullable(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
});

export const queryResponse = ok(queryObject);

/**
 * What GET /queries (the list route) actually returns: listAgentQueries maps
 * each row to a smaller, distinct shape of its own — no status_description,
 * no context/confidence, `answer` unconditioned on status, plus
 * `human_email`, which shapeQuery never exposes because a single-query read
 * has no need to repeat who it was sent to.
 */
export const listQueryObject = z.object({
  query_id: z.string().uuid(),
  status: z.enum(queryStatusEnum.enumValues),
  query_type: z.enum(queryTypeEnum.enumValues),
  question: z.string(),
  human_email: z.string().email(),
  answer: z.record(z.unknown()).nullable(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
});

/**
 * listAgentQueries returns a bare array with no cursor or hasMore — despite
 * the resource being named "queries" like the paginated conversations list,
 * this one does not paginate at all, so a `pagination` field here would
 * describe something the response never sends.
 */
export const listQueryResponse = ok(z.array(listQueryObject));

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
