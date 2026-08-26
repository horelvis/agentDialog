import { describe, expect, it } from "bun:test";
import {
  assertValidIdempotencyKey,
  decideFromRecord,
  hashBody,
  idempotencyStorageKey,
} from "../../src/lib/idempotency";

describe("idempotency key validation", () => {
  it("accepts an ordinary key", () => {
    expect(() => assertValidIdempotencyKey("a1b2c3")).not.toThrow();
  });

  it("refuses an empty key", () => {
    // An empty header is indistinguishable from sending none. Refusing it stops
    // a client believing it is protected when it is not.
    expect(() => assertValidIdempotencyKey("")).toThrow();
    expect(() => assertValidIdempotencyKey("   ")).toThrow();
  });

  it("refuses a key longer than 255 characters", () => {
    expect(() => assertValidIdempotencyKey("x".repeat(256))).toThrow();
  });
});

describe("storage key", () => {
  it("separates agents, methods and paths", () => {
    const a = idempotencyStorageKey("agent-1", "POST", "/api/v1/agent/queries", "same");
    const b = idempotencyStorageKey("agent-2", "POST", "/api/v1/agent/queries", "same");
    const c = idempotencyStorageKey("agent-1", "POST", "/api/v1/agent/webhooks", "same");

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toStartWith("idem:agent-1:");
  });

  it("is stable for the same inputs", () => {
    const first = idempotencyStorageKey("agent-1", "POST", "/p", "k");
    const second = idempotencyStorageKey("agent-1", "POST", "/p", "k");
    expect(first).toBe(second);
  });
});

describe("decideFromRecord", () => {
  const hash = hashBody(JSON.stringify({ question: "ship?" }));

  it("proceeds when nothing is stored", () => {
    expect(decideFromRecord(null, hash)).toEqual({ kind: "proceed" });
  });

  it("reports a request still in flight", () => {
    expect(decideFromRecord({ state: "in_progress", bodyHash: hash }, hash)).toEqual({
      kind: "in_progress",
    });
  });

  it("replays a completed response for the same body", () => {
    const record = {
      state: "completed" as const,
      bodyHash: hash,
      status: 201,
      body: '{"data":{"query_id":"q1"}}',
    };
    expect(decideFromRecord(record, hash)).toEqual({
      kind: "replay",
      status: 201,
      body: '{"data":{"query_id":"q1"}}',
    });
  });

  it("refuses the same key with a different body", () => {
    const record = {
      state: "completed" as const,
      bodyHash: hash,
      status: 201,
      body: "{}",
    };
    expect(decideFromRecord(record, hashBody("{\"question\":\"other\"}"))).toEqual({
      kind: "reused",
    });
  });

  it("refuses a key reused with a different body while still in flight", () => {
    const record = { state: "in_progress" as const, bodyHash: hash };
    expect(decideFromRecord(record, hashBody("{}"))).toEqual({ kind: "reused" });
  });
});
