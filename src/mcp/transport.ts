import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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

export async function handleMcpRequest(
  req: Request,
  agentId: string,
): Promise<Response> {
  const method = req.method;

  if (method === "POST") {
    // Check for existing session
    const sessionId = req.headers.get("mcp-session-id");

    if (sessionId && sessions.has(sessionId)) {
      // Existing session — delegate
      const entry = sessions.get(sessionId)!;
      return entry.transport.handleRequest(req);
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

    // Inject agentId into the server's request handler extra context
    const originalOnMessage = transport.onmessage;
    transport.onmessage = (message, extra) => {
      if (extra) {
        (extra as any).agentId = agentId;
      }
      if (originalOnMessage) {
        originalOnMessage(message, extra);
      }
    };

    try {
      await server.connect(transport);
    } catch (err) {
      console.error(`[MCP] Failed to connect server for agent ${agentId}:`, err);
      return new Response("Internal server error", { status: 500 });
    }

    // Now re-inject after connect overwrites onmessage
    const serverOnMessage = transport.onmessage;
    transport.onmessage = (message, extra) => {
      if (extra) {
        (extra as any).agentId = agentId;
      } else {
        extra = { agentId } as any;
      }
      if (serverOnMessage) {
        serverOnMessage(message, extra);
      }
    };

    return transport.handleRequest(req);
  }

  if (method === "GET") {
    // SSE stream for server-initiated messages
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId && sessions.has(sessionId)) {
      return sessions.get(sessionId)!.transport.handleRequest(req);
    }
    console.warn(`[MCP] GET session not found: ${sessionId}`);
    return new Response("Session not found", { status: 404 });
  }

  if (method === "DELETE") {
    // Terminate session
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      const response = await entry.transport.handleRequest(req);
      sessions.delete(sessionId);
      console.log(`[MCP] Session deleted via DELETE: ${sessionId} (active: ${sessions.size})`);
      return response;
    }
    console.warn(`[MCP] DELETE session not found: ${sessionId}`);
    return new Response("Session not found", { status: 404 });
  }

  return new Response("Method not allowed", { status: 405 });
}
