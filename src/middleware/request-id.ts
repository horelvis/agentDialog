import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { nanoid } from "nanoid";

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header("X-Request-ID") || nanoid(21);
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
};
