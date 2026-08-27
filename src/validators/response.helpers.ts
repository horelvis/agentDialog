import { z } from "zod";

/**
 * Every code this API can put in an error envelope. Nine come from
 * src/lib/errors.ts; PAYLOAD_TOO_LARGE is emitted inline by app.ts's bodyLimit
 * and INTERNAL_ERROR by the error handler's fallback, so counting only the
 * error classes misses two.
 */
export const ERROR_CODES = [
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "VALIDATION_ERROR",
  "RATE_LIMIT",
  "IDEMPOTENCY_IN_PROGRESS",
  "IDEMPOTENCY_KEY_REUSED",
  "UNDECIDABLE_QUERY",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;

/**
 * The envelope is not flat, and pretending otherwise would misdescribe the
 * error an integrator reads most. src/middleware/error-handler.ts spreads extra
 * fields *beside* `code`, not under `details`: retryAfter on a rate limit, and
 * reason / detail / remedy / prior_query_id on an admission-gate refusal.
 */
export const apiError = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    retryAfter: z.number().int().optional(),
    reason: z.string().optional(),
    detail: z.string().optional(),
    remedy: z.string().optional(),
    prior_query_id: z.string().uuid().optional(),
  }),
});

export function ok<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema });
}

export function paginated<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: z.array(schema),
    pagination: z.object({
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      count: z.number().int(),
    }),
  });
}
