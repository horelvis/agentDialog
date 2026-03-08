import { z } from "zod";

const toolCallData = z.object({
  toolName: z.string(),
  toolInput: z.record(z.unknown()),
  toolServer: z.string().optional(),
  status: z.enum(["pending", "running", "completed", "failed"]).optional(),
});

const toolResultData = z.object({
  toolCallId: z.string().uuid(),
  output: z.unknown(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
});

const formField = z.object({
  name: z.string(),
  type: z.enum(["text", "number", "email", "select", "multiselect", "checkbox", "textarea", "date"]),
  label: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
});

const formData = z.object({
  formId: z.string(),
  title: z.string(),
  fields: z.array(formField),
  expiresAt: z.string().datetime().optional(),
});

const formResponseData = z.object({
  formId: z.string(),
  responses: z.record(z.unknown()),
});

const approvalData = z.object({
  approvalId: z.string(),
  action: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  details: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const approvalResponseData = z.object({
  approvalId: z.string(),
  decision: z.enum(["approved", "denied"]),
  reason: z.string().optional(),
});

const notificationData = z.object({
  severity: z.enum(["info", "warning", "error", "success"]),
  title: z.string(),
  details: z.string().optional(),
  acknowledgeRequired: z.boolean().optional(),
});

const voiceNoteData = z.object({
  durationMs: z.number().positive(),
});

export const createMessageSchema = z.object({
  type: z.enum([
    "text", "structured", "file", "tool_call", "tool_result",
    "form", "form_response", "approval", "approval_response",
    "notification", "system", "voice_note",
  ]).default("text"),
  content: z.string().max(32_000).optional(),
  structuredData: z.record(z.unknown()).optional(),
  replyToId: z.string().uuid().optional(),
  toolCallId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

// Structured data validators by message type
export const structuredDataValidators: Record<string, z.ZodSchema> = {
  tool_call: toolCallData,
  tool_result: toolResultData,
  form: formData,
  form_response: formResponseData,
  approval: approvalData,
  approval_response: approvalResponseData,
  notification: notificationData,
  voice_note: voiceNoteData,
};
