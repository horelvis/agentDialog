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
  const state = { calls: 0, timestamps: [] as number[] };
  globalThis.fetch = (async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    state.calls++;
    state.timestamps.push(Date.now());
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

  it("throws promptly when timeoutMs is shorter than pollIntervalMs", async () => {
    mockSequence(["pending"]);
    const startedAt = Date.now();
    await expect(
      client.waitForAnswer("q1", { pollIntervalMs: 10_000, timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("cuts a hung request short instead of waiting out the OS timeout", async () => {
    // fetch that never resolves on its own — simulates a cold start or a
    // blackholed connection. Like real fetch, it only settles if the
    // request's AbortSignal fires; if waitForAnswer stopped forwarding a
    // signal to fetch, nothing would ever reject this and the test (and a
    // real caller) would hang far past timeoutMs.
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), {
            once: true,
          });
        }
      })) as typeof fetch;

    await expect(
      client.waitForAnswer("q1", { pollIntervalMs: 1, timeoutMs: 30 }),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
  }, 2_000);

  it("backs off between polls, widening the gap over successive attempts", async () => {
    const state = mockSequence(["pending", "pending", "pending", "pending", "answered"]);
    await client.waitForAnswer("q1", { pollIntervalMs: 20, maxPollIntervalMs: 200 });
    const gaps = state.timestamps.slice(1).map((t, i) => t - state.timestamps[i]);
    expect(gaps[2]).toBeGreaterThan(gaps[0]);
  });
});
