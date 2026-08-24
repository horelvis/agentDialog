import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * Sessions live in the process's memory, so a session id outlives the session
 * itself routinely: every deploy, every instance recycle, every 30-minute TTL
 * sweep, and any request that lands on one of the other instances.
 *
 * The protocol has an answer for that. The SDK states it in its own header:
 * "Requests with invalid session IDs are rejected with 404 Not Found" — which
 * is what tells a client to open a new session. A 400 is a hard error it does
 * not recover from, and the client stays stuck until someone reconnects by
 * hand.
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

const TOOLS_CALL = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "list_queries", arguments: { limit: 1 } },
};

describe("a session id the server no longer knows", () => {
  it("is answered 404, so the client opens a new session", async () => {
    const agent = await createTestAgent();

    // A well-formed id that was never issued — indistinguishable, to the
    // server, from one issued by an instance that has since been replaced.
    const stale = crypto.randomUUID();

    const res = await mcpPost(TOOLS_CALL, agent.authHeader, stale);

    expect(res.status).toBe(404);
  });

  it("still rejects a non-initialize request that carries no session at all", async () => {
    const agent = await createTestAgent();

    const res = await mcpPost(TOOLS_CALL, agent.authHeader);

    expect(res.status).toBe(400);
  });
});
