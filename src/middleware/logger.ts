import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
  console.log(`[${level}] ${method} ${path} ${status} ${duration}ms`);
};
