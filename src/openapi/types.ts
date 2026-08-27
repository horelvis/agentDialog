import type { ZodTypeAny } from "zod";

export interface RouteDoc {
  summary: string;
  description?: string;
  /** Reuse the very schema that validates the request. Never a copy of it. */
  body?: ZodTypeAny;
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
