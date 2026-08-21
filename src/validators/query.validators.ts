import { z } from "zod";
import { answerSpaceSchema, answerSchema } from "../lib/answer-space";

export const subjectSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(200),
  uri: z.string().url().optional(),
  attachments: z.array(z.string().uuid()).max(10).optional(),
  body: z.string().max(100_000).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
});

export const changeSchema = z.object({
  path: z.string().min(1).max(200),
  before: z.string().max(2_000),
  after: z.string().max(2_000),
  materiality: z.enum(["minor", "material"]),
});

export const createQuerySchema = z.object({
  query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"]),
  risk: z.enum(["low", "medium", "high", "critical"]).default("low"),
  subject: subjectSchema,
  self_contained: z.boolean().default(false),
  question: z.string().min(1).max(10_000),
  context: z.string().max(100_000).optional(),
  changes: z.array(changeSchema).max(100).optional(),
  answer_space: answerSpaceSchema,
  target_human_email: z.string().email(),
  confidence: z.number().min(0).max(1).optional(),
  timeout_minutes: z.number().int().min(1).max(10080).default(60),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateQueryInput = z.infer<typeof createQuerySchema>;

export const getQuerySchema = z.object({
  query_id: z.string().uuid(),
});

export type GetQueryInput = z.infer<typeof getQuerySchema>;

export const listQueriesSchema = z.object({
  status: z.enum(["pending", "assigned", "answered", "expired"]).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type ListQueriesInput = z.infer<typeof listQueriesSchema>;

export const INSUFFICIENT_REASONS = [
  "unknown_subject", "missing_delta", "unclear_consequences",
  "referent_unreachable", "not_my_decision",
] as const;

export const respondQuerySchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("answer"),
    answer: answerSchema,
    comment: z.string().max(32_000).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    outcome: z.literal("insufficient_context"),
    reason: z.enum(INSUFFICIENT_REASONS),
    note: z.string().max(2_000).optional(),
  }),
]);

export type RespondQueryInput = z.infer<typeof respondQuerySchema>;

// GET variant: query-string values always arrive as strings, so limit is coerced.
// listQueriesSchema is left untouched because the MCP list_queries tool uses it.
export const listQueriesQuerySchema = z.object({
  status: z.enum(["pending", "assigned", "answered", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQueriesQueryInput = z.infer<typeof listQueriesQuerySchema>;

// Kept separate from `patchQuerySchema` so the MCP `clarify_query` tool can
// build its argument schema from the exact same field definitions, rather
// than duplicating them and risking drift.
export const patchQueryFields = {
  subject: subjectSchema.optional(),
  changes: z.array(changeSchema).max(100).optional(),
  answer_space: answerSpaceSchema.optional(),
  question: z.string().min(1).max(10_000).optional(),
  context: z.string().max(100_000).optional(),
};

export const patchQuerySchema = z.object(patchQueryFields)
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

export type PatchQueryInput = z.infer<typeof patchQuerySchema>;
