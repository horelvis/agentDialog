import { z } from "zod";

export const createQuerySchema = z.object({
  query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"]),
  question: z.string().min(1).max(10_000),
  context: z.string().max(100_000).optional(),
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

export const respondQuerySchema = z.object({
  answer: z.string().min(1).max(32_000),
  comment: z.string().max(32_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type RespondQueryInput = z.infer<typeof respondQuerySchema>;

// GET variant: query-string values always arrive as strings, so limit is coerced.
// listQueriesSchema is left untouched because the MCP list_queries tool uses it.
export const listQueriesQuerySchema = z.object({
  status: z.enum(["pending", "assigned", "answered", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQueriesQueryInput = z.infer<typeof listQueriesQuerySchema>;
