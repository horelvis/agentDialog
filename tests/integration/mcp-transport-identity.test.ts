import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * Every other MCP test calls the registered handlers directly, handing them an
 * `extra` of `{ agentId }`. The transport cannot produce that shape: the SDK
 * builds the handler's `extra` by naming fields one at a time and a property
 * mutated onto the transport's own `extra` never crosses. So the suite passed
 * while every tool in production answered "Authentication required".
 *
 * These go over the real HTTP surface — initialize, then tools/call — which is
 * the only path that can catch it.
 */

const app = createTestApp();

async function mcpPost(body: unknown, authHeader: string, sessionId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: authHeader,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return app.request("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

/** The transport answers either plain JSON or an SSE frame. */
async function rpcResult(res: Response) {
  const text = await res.text();
  const line = text.startsWith("event:") || text.includes("\ndata: ")
    ? text.split("\n").find((l) => l.startsWith("data: "))!.slice(6)
    : text;
  return JSON.parse(line);
}

/** Runs the real handshake and returns the session the transport issued. */
async function openSession(authHeader: string) {
  const res = await mcpPost(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "identity-test", version: "1.0.0" },
      },
    },
    authHeader,
  );
  expect(res.status).toBe(200);

  const sessionId = res.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();

  await mcpPost(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    authHeader,
    sessionId!,
  );

  return sessionId!;
}

async function callListQueries(authHeader: string, sessionId: string) {
  const res = await mcpPost(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_queries", arguments: { limit: 5 } },
    },
    authHeader,
    sessionId,
  );
  const rpc = await rpcResult(res);
  return JSON.parse(rpc.result.content[0].text);
}

async function createQuery(authHeader: string, subjectId: string) {
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation",
      risk: "low",
      subject: { id: subjectId, label: "Contrato", body: "el texto" },
      question: "¿Firmamos?",
      answer_space: {
        kind: "choice",
        select: "one",
        options: [
          { id: "yes", label: "Sí", consequence: "Firmo." },
          { id: "no", label: "No", consequence: "No firmo." },
        ],
      },
      target_human_email: `owner-${subjectId}@example.com`,
      timeout_minutes: 60,
    }),
  });
  expect(res.status).toBe(201);
}

describe("MCP tools over the real transport", () => {
  it("reaches the tool with the caller's identity", async () => {
    const agent = await createTestAgent();
    const sessionId = await openSession(agent.authHeader);

    const body = await callListQueries(agent.authHeader, sessionId);

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.queries)).toBe(true);
  });

  it("does not let another agent's session lend its identity", async () => {
    const owner = await createTestAgent();
    const other = await createTestAgent();

    // Something only `owner` can legitimately see.
    const subject = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await createQuery(owner.authHeader, subject);

    // The session belongs to `owner`; `other` presents it with their own key.
    // The authenticated caller decides identity, never the session id.
    const ownerSession = await openSession(owner.authHeader);
    const body = await callListQueries(other.authHeader, ownerSession);

    expect(body.error).toBeUndefined();
    expect(body.queries).toHaveLength(0);
  });
});
