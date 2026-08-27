import { z } from "zod";

// Not a database enum (src/db/schema/conversations.ts stores it as a plain
// varchar), so this is the one source of truth for the four values — exported
// so conversation.responses.ts's conversationObject.intentType reads the same
// list rather than declaring it as an unconstrained string.
export const CONVERSATION_INTENT_TYPES = [
  "permission", "clarification", "solicitation", "notification",
] as const;

export const createConversationSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(2048).optional(),
  context: z.record(z.unknown()).optional(),
  intentType: z.enum(CONVERSATION_INTENT_TYPES).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(2048).optional(),
  status: z.enum(["active", "archived", "closed"]).optional(),
  context: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
