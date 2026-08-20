import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";
import { QueryTimeoutError } from "../src/errors.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function queryPayload(status: string, answer: string | null = null) {
  return {
    data: {
      query_id: "q1", status, query_type: "validation", question: "Ship it?",
      context: null, confidence: null, answer, comment: null,
      human_confidence: null, response_time_ms: null,
      created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
    },
  };
}

/** Serves the given statuses in order, repeating the last one forever. */
function mockSequence(statuses: string[]) {
  let i = 0;
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    state.calls++;
    const answer = status === "answered" ? "yes" : null;
    return new Response(JSON.stringify(queryPayload(status, answer)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return state;
}

describe("waitForAnswer", () => {
  const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

  it("polls until the query is answered", async () => {
    const state = mockSequence(["pending", "assigned", "answered"]);
    const query = await client.waitForAnswer("q1", { pollIntervalMs: 1 });
    expect(query.status).toBe("answered");
    expect(query.answer).toBe("yes");
    expect(state.calls).toBe(3);
  });

  it("resolves rather than throwing when the query expires", async () => {
    mockSequence(["pending", "expired"]);
    const query = await client.waitForAnswer("q1", { pollIntervalMs: 1 });
    expect(query.status).toBe("expired");
  });

  it("throws QueryTimeoutError once timeoutMs elapses", async () => {
    mockSequence(["pending"]);
    await expect(
      client.waitForAnswer("q1", { pollIntervalMs: 1, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
  });

  it("stops when the signal is aborted", async () => {
    mockSequence(["pending"]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("caller gave up")), 10);
    await expect(
      client.waitForAnswer("q1", { pollIntervalMs: 1, signal: controller.signal }),
    ).rejects.toThrow("caller gave up");
  });
});
