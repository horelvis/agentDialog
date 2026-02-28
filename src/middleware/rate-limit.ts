import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { getRedis } from "../lib/redis";
import { RateLimitError } from "../lib/errors";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyFn?: (c: any) => string;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const redis = getRedis();
    const key = options.keyFn
      ? `ratelimit:${options.keyPrefix}:${options.keyFn(c)}`
      : `ratelimit:${options.keyPrefix}:${c.req.header("x-forwarded-for") || "unknown"}`;

    const windowSeconds = Math.ceil(options.windowMs / 1000);
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, options.max - current);
    c.header("X-RateLimit-Limit", String(options.max));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (current > options.max) {
      const ttl = await redis.ttl(key);
      throw new RateLimitError(ttl > 0 ? ttl : windowSeconds);
    }

    await next();
  };
}

export const agentRateLimit = (rpm: number) =>
  rateLimit({
    windowMs: 60_000,
    max: rpm,
    keyPrefix: "agent",
    keyFn: (c) => c.get("agentId") || "unknown",
  });

export const humanRateLimit = (rpm: number) =>
  rateLimit({
    windowMs: 60_000,
    max: rpm,
    keyPrefix: "human",
    keyFn: (c) => c.get("humanId") || "unknown",
  });

export const registerRateLimit = (rph: number) =>
  rateLimit({
    windowMs: 3_600_000,
    max: rph,
    keyPrefix: "register",
  });
