import type { ZodTypeAny } from "zod";

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
  responses: Record<number, ZodTypeAny>;
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
