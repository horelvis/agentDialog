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

describe("query methods", () => {
  it("defaults to the production API host", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });
    await client.createQuery({
      queryType: "validation",
      question: "Ship it?",
      targetHumanEmail: "someone@example.com",
    });
    expect(calls[0].url).toBe("https://api.agentdialog.io/api/v1/agent/queries");
  });

  it("sends camelCase input as snake_case", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    await client.createQuery({
      queryType: "expert_query",
      question: "Ship it?",
      targetHumanEmail: "someone@example.com",
      timeoutMinutes: 30,
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({
      query_type: "expert_query",
      question: "Ship it?",
      target_human_email: "someone@example.com",
      timeout_minutes: 30,
    });
  });

  it("maps a snake_case response into camelCase", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "answered", query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: "yes", comment: "go ahead", human_confidence: 0.9,
        response_time_ms: 1234,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.getQuery("q1");
    expect(query.queryId).toBe("q1");
    expect(query.humanConfidence).toBe(0.9);
    expect(query.responseTimeMs).toBe(1234);
    expect(query.answer).toBe("yes");
  });

  it("passes list filters as query parameters and maps the response", async () => {
    const calls = mockFetch({
      data: [
        {
          query_id: "q1", status: "answered", query_type: "validation",
          question: "Ship it?", human_email: "someone@example.com",
          answer: "yes", created_at: "2026-08-20T10:00:00.000Z",
          expires_at: "2026-08-20T12:00:00.000Z",
        },
      ],
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const queries = await client.listQueries({ status: "answered", limit: 5 });
    expect(calls[0].url).toBe("https://example.test/api/v1/agent/queries?status=answered&limit=5");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toEqual({
      queryId: "q1",
      status: "answered",
      queryType: "validation",
      question: "Ship it?",
      humanEmail: "someone@example.com",
      answer: "yes",
      createdAt: "2026-08-20T10:00:00.000Z",
      expiresAt: "2026-08-20T12:00:00.000Z",
    });
  });
});
