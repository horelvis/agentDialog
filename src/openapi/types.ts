import type { ZodTypeAny } from "zod";

/**
 * A single documented response: the schema and, separately, what it means on
 * this route. `description` is the one required field of an OpenAPI Response
 * Object — an empty one passes the structural checks in
 * tests/unit/openapi-document.test.ts but renders as a blank line in Redoc,
 * Swagger UI or Scalar, and previously hid a real distinction: the same
 * status code can mean different things on different routes (a 409 from the
 * idempotency middleware is not a 409 from a domain conflict), and only the
 * description says which.
 */
export interface ResponseDoc {
  /** Reuse the very schema that validates the response. Never a copy of it. */
  schema: ZodTypeAny;
  description: string;
}

/** Shorthand for a RouteDoc.responses entry — `res(schema, "...")` instead of `{ schema, description: "..." }`. */
export function res(schema: ZodTypeAny, description: string): ResponseDoc {
  return { schema, description };
}

export interface RouteDoc {
  summary: string;
  description?: string;
  /** Reuse the very schema that validates the request. Never a copy of it. */
  body?: ZodTypeAny;
  /**
   * Defaults to "application/json". Set to "multipart/form-data" for the
   * three routes that read c.req.formData() instead of validateBody — there
   * is no Zod schema behind those, so `body` there is a documentation-only
   * approximation of the form fields, not a reused validator.
   */
  bodyContentType?: "application/json" | "multipart/form-data";
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  responses: Record<number, ResponseDoc>;
  /** Only the seven POSTs that actually honour Idempotency-Key. */
  idempotent?: boolean;
  /** "none" is for register, the one agent route outside the auth wall. */
  security?: "bearer" | "none";
}

export interface RegisteredRoute {
  method: string;
  /** The full path, with Hono's :id turned into OpenAPI's {id}. */
  path: string;
  tag: string;
  doc: RouteDoc;
}
