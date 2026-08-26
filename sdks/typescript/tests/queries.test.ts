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

describe("query methods", () => {
  it("defaults to the production API host", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });
    await client.createQuery({
      queryType: "validation",
      subject,
      answerSpace,
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
      subject,
      answerSpace,
      question: "Ship it?",
      targetHumanEmail: "someone@example.com",
      timeoutMinutes: 30,
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({
      query_type: "expert_query",
      subject,
      answer_space: { kind: "boolean", labels: { t: "Yes", f: "No" } },
      question: "Ship it?",
      target_human_email: "someone@example.com",
      timeout_minutes: 30,
    });
  });

  it("translates the two nested shapes that also change case", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    await client.createQuery({
      queryType: "labeling",
      subject,
      answerSpace: {
        kind: "choice",
        select: "one",
        options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }],
      },
      question: "Which one?",
      targetHumanEmail: "someone@example.com",
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.answer_space).toEqual({
      kind: "choice",
      select: "one",
      options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }],
    });

    const textCalls = mockFetch({ data: { query_id: "q2", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    await client.createQuery({
      queryType: "labeling",
      subject,
      answerSpace: { kind: "text", maxLength: 500 },
      question: "Describe it",
      targetHumanEmail: "someone@example.com",
    });
    const textBody = JSON.parse(String(textCalls[0].init.body));
    expect(textBody.answer_space).toEqual({ kind: "text", max_length: 500 });
  });

  it("maps a snake_case response into camelCase, including a typed answer", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "answered", status_description: "The human has responded.",
        query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: { kind: "boolean", value: true }, comment: "go ahead", human_confidence: 0.9,
        response_time_ms: 1234, insufficient_reason: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.getQuery("q1");
    expect(query.queryId).toBe("q1");
    expect(query.humanConfidence).toBe(0.9);
    expect(query.responseTimeMs).toBe(1234);
    expect(query.answer).toEqual({ kind: "boolean", value: true });
    expect(query.statusDescription).toBe("The human has responded.");
  });

  it("maps a choice answer's option_ids into optionIds", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "answered", status_description: "The human has responded.",
        query_type: "labeling",
        question: "Which one?", context: null, confidence: null,
        answer: { kind: "choice", option_ids: ["a", "b"] }, comment: null, human_confidence: null,
        response_time_ms: 500, insufficient_reason: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.getQuery("q1");
    expect(query.answer).toEqual({ kind: "choice", optionIds: ["a", "b"] });
  });

  it("passes list filters as query parameters and maps the response", async () => {
    const calls = mockFetch({
      data: [
        {
          query_id: "q1", status: "answered", query_type: "validation",
          question: "Ship it?", human_email: "someone@example.com",
          answer: { kind: "boolean", value: true }, created_at: "2026-08-20T10:00:00.000Z",
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
      answer: { kind: "boolean", value: true },
      createdAt: "2026-08-20T10:00:00.000Z",
      expiresAt: "2026-08-20T12:00:00.000Z",
    });
  });

  it("clarifyQuery PATCHes only the supplied fields, translating answerSpace", async () => {
    const calls = mockFetch({
      data: {
        query_id: "q1", status: "assigned", status_description: "The human has accepted the invitation.",
        query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: null, comment: null, human_confidence: null,
        response_time_ms: null, insufficient_reason: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.clarifyQuery("q1", {
      answerSpace: { kind: "text", maxLength: 200 },
      context: "Here's the missing referent.",
    });
    expect(calls[0].url).toBe("https://example.test/api/v1/agent/queries/q1");
    expect(calls[0].init.method).toBe("PATCH");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({
      answer_space: { kind: "text", max_length: 200 },
      context: "Here's the missing referent.",
    });
    expect(query.status).toBe("assigned");
    expect(query.statusDescription).toBe("The human has accepted the invitation.");
  });

  it("cancelQuery POSTs to the cancel endpoint with no body", async () => {
    const calls = mockFetch({
      data: {
        query_id: "q1", status: "cancelled", status_description: "You withdrew this query.",
        query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: null, comment: null, human_confidence: null,
        response_time_ms: null, insufficient_reason: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.cancelQuery("q1");
    expect(calls[0].url).toBe("https://example.test/api/v1/agent/queries/q1/cancel");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
    expect(query.status).toBe("cancelled");
    expect(query.statusDescription).toBe("You withdrew this query.");
  });

  it("surfaces insufficientReason once a query needs context", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "needs_context",
        status_description: "The human could not decide with what you gave them.",
        query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: null, comment: null, human_confidence: null,
        response_time_ms: null, insufficient_reason: "unknown_subject",
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.getQuery("q1");
    expect(query.status).toBe("needs_context");
    expect(query.insufficientReason).toBe("unknown_subject");
  });

  it("passes language through clarifyQuery as a wire field", async () => {
    const calls = mockFetch({
      data: {
        query_id: "q1", status: "assigned", status_description: "The human has accepted the invitation.",
        query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: null, comment: null, human_confidence: null,
        response_time_ms: null, insufficient_reason: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    await client.clarifyQuery("q1", {
      context: "Here's more information in Spanish.",
      language: "es",
    });
    const body = JSON.parse(String(calls[0].init.body));
    // Verify that language survives the conversion to wire format unchanged
    expect(body.language).toBe("es");
    expect(body.context).toBe("Here's more information in Spanish.");
  });
});
