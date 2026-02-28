import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(2048).optional(),
  context: z.record(z.unknown()).optional(),
  intentType: z.enum(["permission", "clarification", "solicitation", "notification"]).optional(),
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
