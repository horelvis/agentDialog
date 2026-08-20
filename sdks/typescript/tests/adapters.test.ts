import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";
import { askHumanTool, checkAnswerTool } from "../src/ai/index.js";
import { askHumanTool as lcAskHumanTool } from "../src/langchain/index.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(payload: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

describe("Vercel AI SDK adapter", () => {
  it("askHumanTool creates a query and returns the id", async () => {
    const calls = mockFetch({
      data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" },
    });
    const tool = askHumanTool(client, { defaultEmail: "owner@example.com" });
    const result = await tool.execute!(
      { question: "Ship it?", queryType: "validation" },
      {} as any,
    );
    expect(result.queryId).toBe("q1");
    expect(result.status).toBe("pending");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.target_human_email).toBe("owner@example.com");
    expect(body.question).toBe("Ship it?");
  });

  it("checkAnswerTool reads a query", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "answered", query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: "yes", comment: null, human_confidence: null,
        response_time_ms: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const tool = checkAnswerTool(client);
    const result = await tool.execute!({ queryId: "q1" }, {} as any);
    expect(result.status).toBe("answered");
    expect(result.answer).toBe("yes");
  });

  it("askHumanTool rejects when no email is available", async () => {
    mockFetch({ data: {} });
    const tool = askHumanTool(client);
    await expect(
      tool.execute!({ question: "Ship it?", queryType: "validation" }, {} as any),
    ).rejects.toThrow(/target email/i);
  });
});

describe("LangChain adapter", () => {
  it("exposes a structured tool that creates a query", async () => {
    mockFetch({
      data: { query_id: "q2", status: "pending", conversation_id: "c2", expires_at: "2026-08-20T12:00:00.000Z" },
    });
    const tool = lcAskHumanTool(client, { defaultEmail: "owner@example.com" });
    expect(tool.name).toBe("ask_human");
    const raw = await tool.invoke({ question: "Ship it?", queryType: "validation" });
    expect(JSON.parse(raw).queryId).toBe("q2");
  });
});
