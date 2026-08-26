import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { getRedis } from "../lib/redis";
import { IdempotencyConflictError } from "../lib/errors";
import {
  IDEMPOTENCY_TTL_SECONDS,
  assertValidIdempotencyKey,
  decideFromRecord,
  hashBody,
  idempotencyStorageKey,
  type IdempotencyRecord,
} from "../lib/idempotency";

/**
 * Applied per route rather than globally, so adding a POST is a decision
 * somebody makes rather than something inherited by accident. It must sit after
 * agentAuth, which is what puts `agentId` in the context.
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (key === undefined) return next();

    assertValidIdempotencyKey(key);

    // Reading the body here does not starve validateBody downstream: Hono caches
    // the body per type, and a later json() re-parses from the cached text.
    const raw = await c.req.text();
    const bodyHash = hashBody(raw);

    const redis = getRedis();
    const storageKey = idempotencyStorageKey(
      c.get("agentId"),
      c.req.method,
      new URL(c.req.url).pathname,
      key,
    );

    const reserved = await redis.set(
      storageKey,
      JSON.stringify({ state: "in_progress", bodyHash } satisfies IdempotencyRecord),
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
      "NX",
    );

    if (reserved === null) {
      const stored = await redis.get(storageKey);
      const record = stored ? (JSON.parse(stored) as IdempotencyRecord) : null;
      const decision = decideFromRecord(record, bodyHash);

      if (decision.kind === "in_progress") {
        throw new IdempotencyConflictError(
          "A request with this Idempotency-Key is still in progress",
          "IDEMPOTENCY_IN_PROGRESS",
        );
      }
      if (decision.kind === "reused") {
        throw new IdempotencyConflictError(
          "This Idempotency-Key was already used with a different request body",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      if (decision.kind === "replay") {
        c.res = new Response(decision.body, {
          status: decision.status,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Replayed": "true",
          },
        });
        return;
      }
      // "proceed": the record expired between SET and GET. Fall through and run.
    }

    await next();

    const status = c.res.status;
    if (status >= 200 && status < 300) {
      const body = await c.res.clone().text();
      // KEEPTTL is not a detail: a plain SET restarts the clock, and then the
      // window is measured from the last write instead of the first request.
      await redis.set(
        storageKey,
        JSON.stringify({ state: "completed", bodyHash, status, body } satisfies IdempotencyRecord),
        "KEEPTTL",
      );
    } else {
      // Only successful responses are remembered. A rejected request must leave
      // the key free for the corrected retry.
      await redis.del(storageKey);
    }
  };
}
