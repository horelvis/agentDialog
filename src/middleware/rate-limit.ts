import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { getRedis } from "../lib/redis";
import { RateLimitError } from "../lib/errors";
import { getLimitsConfig } from "../config/limits";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyFn?: (c: any) => string;
}

/**
 * Extract client IP safely from proxy headers.
 * Priority: x-real-ip -> first IP in x-forwarded-for -> "unknown"
 */
export function getClientIp(c: Context): string {
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    return first.trim();
  }

  return "unknown";
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const redis = getRedis();
    const identifier = options.keyFn
      ? options.keyFn(c)
      : getClientIp(c);
    const key = `ratelimit:${options.keyPrefix}:${identifier}`;

    const windowSeconds = Math.ceil(options.windowMs / 1000);
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, options.max - current);
    c.header("X-RateLimit-Limit", String(options.max));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (current > options.max) {
      // Apply progressive penalty
      await applyPenalty(redis, identifier);

      const ttl = await redis.ttl(key);
      throw new RateLimitError(ttl > 0 ? ttl : windowSeconds);
    }

    await next();
  };
}

/**
 * Progressive slow-down: when an IP gets rate-limited,
 * double the penalty for subsequent windows (max 5 min).
 */
async function applyPenalty(redis: ReturnType<typeof getRedis>, identifier: string): Promise<void> {
  const penaltyKey = `ratelimit:penalty:${identifier}`;
  const limits = getLimitsConfig();

  const current = await redis.get(penaltyKey);
  const currentPenalty = current ? parseInt(current as string, 10) : 0;

  // Double penalty each time, starting at 60s, max 5 min
  const newPenalty = Math.min(
    currentPenalty > 0 ? currentPenalty * 2 : 60,
    limits.penaltyMaxSeconds,
  );

  await redis.set(penaltyKey, String(newPenalty), "EX", newPenalty);
}

/**
 * Get current penalty seconds for an IP (0 if none).
 */
async function getPenalty(redis: ReturnType<typeof getRedis>, identifier: string): Promise<number> {
  const penaltyKey = `ratelimit:penalty:${identifier}`;
  const val = await redis.get(penaltyKey);
  return val ? parseInt(val as string, 10) : 0;
}

/**
 * Global rate limit by IP - applies to all routes before auth.
 * Prevents a single IP from saturating the service.
 */
export function globalRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const redis = getRedis();
    const ip = getClientIp(c);
    const limits = getLimitsConfig();
    const key = `ratelimit:global:${ip}`;

    // Check penalty - if IP is in penalty, use reduced limit
    const penalty = await getPenalty(redis, ip);
    const windowSeconds = penalty > 0 ? penalty : 60;
    const max = limits.globalRpm;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, max - current);
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (current > max) {
      await applyPenalty(redis, ip);
      const ttl = await redis.ttl(key);
      throw new RateLimitError(ttl > 0 ? ttl : windowSeconds);
    }

    await next();
  };
}

/**
 * Auth endpoint rate limiter by IP.
 * @param name - unique name to distinguish endpoints (e.g. "send-code", "verify")
 */
export const authRateLimit = (name: string, rpm: number) =>
  rateLimit({
    windowMs: 60_000,
    max: rpm,
    keyPrefix: `auth:${name}`,
  });

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
