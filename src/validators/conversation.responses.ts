import { z } from "zod";
import { ok } from "./response.helpers";

/**
 * Read off createConversation / updateConversation in
 * src/services/conversation.service.ts, which return the raw Drizzle row
 * unshaped — unlike query.service.ts's shapeQuery, nothing here translates
 * camelCase to snake_case or drops internal columns. Keys and casing below
 * match the schema in src/db/schema/conversations.ts exactly.
 *
 * title, description and intentType are nullable because their columns have
 * no default and createConversationSchema treats them as optional input —
 * omitting them at creation leaves the column NULL, not merely absent from
 * the response.
 */
export const conversationObject = z.object({
  id: z.string().uuid(),
  createdByAgentId: z.string().uuid(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(["active", "archived", "closed"]),
  context: z.record(z.unknown()),
  intentType: z.string().nullable(),
  settings: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const conversationResponse = ok(conversationObject);

/**
 * What GET /conversations/:id actually returns: getConversationWithParticipants
 * spreads the conversation row and adds `participants`, each already shaped
 * by the route's own mapping (src/services/conversation.service.ts) rather
 * than a raw conversationParticipants row — agentId/humanId stay nullable
 * because only one of the two is set per actorType, and joinedAt is already
 * an ISO string by the time it leaves the service.
 */
export const conversationWithParticipantsObject = conversationObject.extend({
  participants: z.array(
    z.object({
      actorType: z.enum(["agent", "human"]),
      agentId: z.string().uuid().nullable(),
      humanId: z.string().uuid().nullable(),
      displayName: z.string(),
      role: z.string(),
      joinedAt: z.string().datetime(),
    }),
  ),
});

export const conversationWithParticipantsResponse = ok(conversationWithParticipantsObject);

/**
 * GET /conversations builds its own envelope by hand (route, not
 * listAgentConversations) — `{ data, pagination: { hasMore, count } }` — and
 * never includes nextCursor or prevCursor despite paginationQuery accepting a
 * cursor. That is a narrower shape than response.helpers.ts's paginated(),
 * which requires both; asserting the real response against paginated() would
 * fail here, so this documents what the route actually sends rather than the
 * generic envelope.
 */
export const conversationListResponse = z.object({
  data: z.array(conversationObject),
  pagination: z.object({
    hasMore: z.boolean(),
    count: z.number().int(),
  }),
});
