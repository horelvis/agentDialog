import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpServer } from "./server";

// Map of sessionId → { transport, createdAt } for stateful sessions
const MAX_SESSIONS = 1000;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface SessionEntry {
  transport: WebStandardStreamableHTTPServerTransport;
  createdAt: number;
}

const sessions = new Map<string, SessionEntry>();

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessions) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      sessions.delete(sid);
      console.log(`[MCP] Session expired (TTL): ${sid} (active: ${sessions.size})`);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

// The SDK assembles a tool handler's `extra` by naming fields one at a time —
// `authInfo`, `requestId`, `requestInfo` and a few more — rather than spreading
// what the transport received. A property of our own set on the transport's
// extra is therefore dropped before any handler sees it. `authInfo` is the one
// channel that does cross, and `AuthInfo.extra` is documented as the place for
// data of our own, so the agent travels there.
//
// It is built per request on purpose. Deriving it from the session instead
// would make the session id decide who the caller is, and anyone holding
// another agent's session id would act as that agent.
function authInfoFor(req: Request, agentId: string): AuthInfo {
  return {
    token: (req.headers.get("Authorization") ?? "").slice(7),
    clientId: agentId,
    scopes: [],
    extra: { agentId },
  };
}

export async function handleMcpRequest(
  req: Request,
  agentId: string,
): Promise<Response> {
  const method = req.method;
  const authInfo = authInfoFor(req, agentId);

  if (method === "POST") {
    // Check for existing session
    const sessionId = req.headers.get("mcp-session-id");

    if (sessionId && sessions.has(sessionId)) {
      // Existing session — delegate, with this request's own caller
      const entry = sessions.get(sessionId)!;
      return entry.transport.handleRequest(req, { authInfo });
    }

    // Reject if at capacity
    if (sessions.size >= MAX_SESSIONS) {
      console.warn(`[MCP] Session limit reached (${MAX_SESSIONS}), rejecting new session`);
      return new Response("Too many active sessions", { status: 503 });
    }

    // New session or stateful initialization
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { transport, createdAt: Date.now() });
        console.log(`[MCP] Session created: ${sid} for agent ${agentId} (active: ${sessions.size})`);
      },
      onsessionclosed: (sid) => {
        sessions.delete(sid);
        console.log(`[MCP] Session closed: ${sid} (active: ${sessions.size})`);
      },
    });

    const server = createMcpServer();

    try {
      await server.connect(transport);
    } catch (err) {
      console.error(`[MCP] Failed to connect server for agent ${agentId}:`, err);
      return new Response("Internal server error", { status: 500 });
    }

    return transport.handleRequest(req, { authInfo });
  }

  if (method === "GET") {
    // SSE stream for server-initiated messages
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId && sessions.has(sessionId)) {
      return sessions.get(sessionId)!.transport.handleRequest(req, { authInfo });
    }
    console.warn(`[MCP] GET session not found: ${sessionId}`);
    return new Response("Session not found", { status: 404 });
  }

  if (method === "DELETE") {
    // Terminate session
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      const response = await entry.transport.handleRequest(req, { authInfo });
      sessions.delete(sessionId);
      console.log(`[MCP] Session deleted via DELETE: ${sessionId} (active: ${sessions.size})`);
      return response;
    }
    console.warn(`[MCP] DELETE session not found: ${sessionId}`);
    return new Response("Session not found", { status: 404 });
  }

  return new Response("Method not allowed", { status: 405 });
}
