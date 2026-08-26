import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/types/hono";
import { idempotency } from "../../src/middleware/idempotency";
import { errorHandler } from "../../src/middleware/error-handler";
import { getRedis } from "../../src/lib/redis";
import { idempotencyStorageKey } from "../../src/lib/idempotency";

function appWithCounter() {
  let calls = 0;
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("agentId", "agent-under-test");
    await next();
  });
  app.post("/thing", idempotency(), async (c) => {
    calls += 1;
    const body = await c.req.json();
    if (body.fail) return c.json({ error: { code: "NOPE", message: "no" } }, 422);
    return c.json({ data: { calls } }, 201);
  });
  return { app, calls: () => calls };
}

const KEY = () => `k-${Math.random().toString(36).slice(2)}`;

function post(app: Hono<AppEnv>, key: string, body: unknown) {
  return app.request("/thing", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("idempotency middleware", () => {
  beforeEach(() => getRedis());

  it("runs the handler once and replays the first response", async () => {
    const { app, calls } = appWithCounter();
    const key = KEY();

    const first = await post(app, key, { ship: true });
    const second = await post(app, key, { ship: true });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.text()).toBe(await first.clone().text());
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect(calls()).toBe(1);
  });

  it("refuses the same key with a different body", async () => {
    const { app, calls } = appWithCounter();
    const key = KEY();

    await post(app, key, { ship: true });
    const conflicting = await post(app, key, { ship: false });

    expect(conflicting.status).toBe(409);
    expect((await conflicting.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(calls()).toBe(1);
  });

  it("leaves the key free after a failed request", async () => {
    // A 422 from the admission gate tells the agent what to add. It will fix the
    // body and retry with the same key, and that retry has to be allowed.
    const { app, calls } = appWithCounter();
    const key = KEY();

    const rejected = await post(app, key, { fail: true });
    expect(rejected.status).toBe(422);

    const corrected = await post(app, key, { ship: true });
    expect(corrected.status).toBe(201);
    expect(calls()).toBe(2);
  });

  it("ignores requests that carry no key", async () => {
    const { app, calls } = appWithCounter();

    await app.request("/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ship: true }),
    });
    await app.request("/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ship: true }),
    });

    expect(calls()).toBe(2);
  });

  it("refuses an empty key", async () => {
    const { app } = appWithCounter();
    const res = await post(app, "   ", { ship: true });
    expect(res.status).toBe(422);
  });

  it("stores successful responses with a long TTL", async () => {
    const { app } = appWithCounter();
    const key = KEY();
    const redis = getRedis();

    await post(app, key, { ship: true });

    const storageKey = idempotencyStorageKey("agent-under-test", "POST", "/thing", key);
    const ttl = await redis.ttl(storageKey);
    expect(ttl).toBeGreaterThan(80000);
  });

  it("removes the key after a failed request", async () => {
    const { app } = appWithCounter();
    const key = KEY();
    const redis = getRedis();

    await post(app, key, { fail: true });

    const storageKey = idempotencyStorageKey("agent-under-test", "POST", "/thing", key);
    const exists = await redis.exists(storageKey);
    expect(exists).toBe(0);
  });
});
