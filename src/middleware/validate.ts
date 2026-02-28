import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import type { ZodSchema } from "zod";
import { ValidationError } from "../lib/errors";

export function validateBody(schema: ZodSchema): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const body = await c.req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      throw new ValidationError(
        `Validation failed: ${Object.entries(errors)
          .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
          .join("; ")}`,
      );
    }
    c.set("validatedBody", result.data);
    await next();
  };
}

export function validateQuery(schema: ZodSchema): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const query = c.req.query();
    const result = schema.safeParse(query);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      throw new ValidationError(
        `Invalid query parameters: ${Object.entries(errors)
          .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
          .join("; ")}`,
      );
    }
    c.set("validatedQuery", result.data);
    await next();
  };
}
