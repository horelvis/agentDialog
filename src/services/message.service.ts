import { eq, and, desc, lt } from "drizzle-orm";
import { getDb } from "../db";
import { messages } from "../db/schema/messages";
import { fileAttachments } from "../db/schema/file-attachments";
import { NotFoundError, ForbiddenError, ValidationError } from "../lib/errors";
import { structuredDataValidators } from "../validators/message.validators";
import { isParticipant } from "./conversation.service";
import type { CreateMessageInput } from "../validators/message.validators";

export async function createMessage(
  conversationId: string,
  senderType: "agent" | "human",
  senderId: string,
  input: CreateMessageInput,
) {
  const db = getDb();

  // Verify sender is a participant
  const participant = await isParticipant(conversationId, senderType, senderId);
  if (!participant) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  // Validate structured data if present
  if (input.structuredData && input.type in structuredDataValidators) {
    const validator = structuredDataValidators[input.type];
    const result = validator.safeParse(input.structuredData);
    if (!result.success) {
      throw new ValidationError(`Invalid structured data for ${input.type}: ${result.error.message}`);
    }
  }

  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      senderType,
      senderAgentId: senderType === "agent" ? senderId : null,
      senderHumanId: senderType === "human" ? senderId : null,
      type: input.type,
      content: input.content,
      structuredData: input.structuredData,
      replyToId: input.replyToId,
      toolCallId: input.toolCallId,
      metadata: input.metadata || {},
    })
    .returning();

  return message;
}

export async function listMessages(
  conversationId: string,
  limit: number,
  cursor?: string,
) {
  const db = getDb();
  const conditions = [eq(messages.conversationId, conversationId)];

  if (cursor) {
    conditions.push(lt(messages.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      message: messages,
      attachment: {
        id: fileAttachments.id,
        fileName: fileAttachments.fileName,
        mimeType: fileAttachments.mimeType,
        sizeBytes: fileAttachments.sizeBytes,
      },
    })
    .from(messages)
    .leftJoin(fileAttachments, eq(messages.id, fileAttachments.messageId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit((limit + 1) * 2); // extra room for multiple attachments per message

  // Group attachments by message
  const messageMap = new Map<string, { message: typeof rows[0]["message"]; attachments: typeof rows[0]["attachment"][] }>();
  for (const row of rows) {
    const existing = messageMap.get(row.message.id);
    if (existing) {
      if (row.attachment?.id) existing.attachments.push(row.attachment);
    } else {
      messageMap.set(row.message.id, {
        message: row.message,
        attachments: row.attachment?.id ? [row.attachment] : [],
      });
    }
  }

  const results = Array.from(messageMap.values()).map((entry) => ({
    ...entry.message,
    attachments: entry.attachments.length > 0 ? entry.attachments : undefined,
  }));

  const hasMore = results.length > limit;
  if (hasMore) results.splice(limit);

  return {
    data: results.reverse(), // Return in chronological order
    hasMore,
    nextCursor: hasMore && results.length > 0 ? results[0].createdAt.toISOString() : null,
  };
}

export async function getMessage(messageId: string) {
  const db = getDb();
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message) throw new NotFoundError("Message", messageId);
  return message;
}
