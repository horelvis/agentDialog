import type { ErrorHandler } from "hono";
import { AppError, UndecidableQueryError } from "../lib/errors";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    const extra: Record<string, unknown> = {};
    if ("retryAfter" in err) extra.retryAfter = (err as any).retryAfter;
    if (err instanceof UndecidableQueryError) {
      extra.reason = err.reason;
      extra.detail = err.detail;
      extra.remedy = err.remedy;
      if (err.priorQueryId) extra.prior_query_id = err.priorQueryId;
    }
    return c.json(
      { error: { code: err.code, message: err.message, ...extra } },
      err.statusCode as any,
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: err.flatten().fieldErrors,
        },
      },
      422,
    );
  }

  console.error("[UNHANDLED ERROR]", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500,
  );
};
