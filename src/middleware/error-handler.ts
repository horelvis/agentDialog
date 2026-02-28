import type { ErrorHandler } from "hono";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(("retryAfter" in err) ? { retryAfter: (err as any).retryAfter } : {}),
        },
      },
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
