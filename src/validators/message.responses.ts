import { z } from "zod";
import { ok } from "./response.helpers";
import { messageTypeEnum } from "../db/schema/enums";

/**
 * Read off createMessage / listMessages in src/services/message.service.ts,
 * which return the raw Drizzle row from src/db/schema/messages.ts unshaped —
 * same convention as conversation.responses.ts. senderAgentId/senderHumanId
 * are nullable because only one is ever set, matching senderType; content,
 * structuredData, replyToId and toolCallId are nullable because
 * createMessageSchema treats them as optional input with no column default.
 *
 * `attachments` is not a column: it only exists on rows produced by
 * listMessages's join with file_attachments (attaching an array) or by
 * upload.ts building `messageWithAttachment` by hand. A message created
 * through POST /:id/messages carries no such key at all — not `null`, simply
 * absent from the JSON — so this is `.optional()`, not `.nullable()`.
 */
const messageAttachmentObject = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});

export const messageObject = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderType: z.enum(["agent", "human"]),
  senderAgentId: z.string().uuid().nullable(),
  senderHumanId: z.string().uuid().nullable(),
  // From the enum column itself (src/db/schema/enums.ts), not a hand-copied
  // list — a value added there, the way human_query_response was, now
  // reaches this schema for free instead of leaving it stale.
  type: z.enum(messageTypeEnum.enumValues),
  content: z.string().nullable(),
  structuredData: z.record(z.unknown()).nullable(),
  replyToId: z.string().uuid().nullable(),
  toolCallId: z.string().uuid().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  readAt: z.string().datetime().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attachments: z.array(messageAttachmentObject).optional(),
});

export const messageResponse = ok(messageObject);

/**
 * What GET /:id/messages actually sends: the route builds its own pagination
 * object (`{ hasMore, nextCursor, count }`) — no prevCursor, unlike
 * conversation.responses.ts's conversationListResponse and unlike this
 * route's own query parameters, which do accept a cursor for either
 * direction. nextCursor is `.nullable()`, not `.optional()`: listMessages
 * always sets the key, to either an ISO string or null.
 */
export const messageListResponse = z.object({
  data: z.array(messageObject),
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
    count: z.number().int(),
  }),
});
