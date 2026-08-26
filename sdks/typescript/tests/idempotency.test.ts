import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const subject = { id: "deploy-v2.3", label: "Deploy v2.3 to production" };
const answerSpace = { kind: "boolean" as const, labels: { t: "Yes", f: "No" } };

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string>)[name];
}

describe("idempotency keys", () => {
  it("sends one on a created query", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-27T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });

    await client.createQuery({
      queryType: "validation",
      risk: "low",
      subject,
      answerSpace,
      question: "Ship it?",
      targetHumanEmail: "sarah@example.com",
    });

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeTruthy();
  });

  it("reuses the same key when it retries a 429", async () => {
    // The retry repeats an operation that may already have run. Without the key
    // being the same, the retry is exactly the duplicate this feature prevents.
    const seen: Array<string | undefined> = [];
    globalThis.fetch = (async (_url: string, init: RequestInit = {}) => {
      seen.push(headerOf(init, "Idempotency-Key"));
      if (seen.length === 1) {
        return new Response(JSON.stringify({ error: { code: "RATE_LIMIT", message: "slow down" } }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "0" },
        });
      }
      return new Response(JSON.stringify({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-27T12:00:00.000Z" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const client = new AgentDialog({ apiKey: "mge_ag_test" });
    await client.createQuery({
      queryType: "validation",
      risk: "low",
      subject,
      answerSpace,
      question: "Ship it?",
      targetHumanEmail: "sarah@example.com",
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeTruthy();
    expect(seen[0]).toBe(seen[1]);
  });

  it("lets the caller supply its own key", async () => {
    const calls = mockFetch({ data: { id: "w1", url: "https://example.test/hook", events: ["*"], isActive: true, secret: "whsec_x" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });

    await client.createWebhook({ url: "https://example.test/hook" }, { idempotencyKey: "job-42" });

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("job-42");
  });

  it("sends none on a read", async () => {
    const calls = mockFetch({ data: [] });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });

    await client.listWebhooks();

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });
});
