import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { verifyApiKey } from "../lib/crypto";
import { handleMcpRequest } from "../mcp/transport";
import {
  handleRegister,
  renderAuthorizePage,
  handleAuthorizeSubmit,
  handleToken,
} from "../mcp/oauth";

const app = new Hono();

// Authenticate agent from Bearer token header
async function authenticateAgent(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("[MCP:AUTH] Failed: no Authorization header");
    return null;
  }
  if (!authHeader.startsWith("Bearer mge_ag_")) {
    console.warn("[MCP:AUTH] Failed: invalid token prefix");
    return null;
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  const prefix = apiKey.slice(0, 15); // "mge_ag_" + 8 chars

  let agent;
  try {
    const db = getDb();
    [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.apiKeyPrefix, prefix))
      .limit(1);
  } catch (err) {
    console.error("[MCP:AUTH] DB error looking up agent:", err);
    return null;
  }

  if (!agent) {
    console.warn("[MCP:AUTH] Failed: agent not found for prefix", prefix);
    return null;
  }
  if (agent.status !== "active") {
    console.warn(`[MCP:AUTH] Failed: agent ${agent.id} is ${agent.status}`);
    return null;
  }

  const valid = await verifyApiKey(apiKey, agent.apiKeyHash);
  if (!valid) {
    console.warn(`[MCP:AUTH] Failed: invalid API key hash for agent ${agent.id}`);
    return null;
  }

  console.log(`[MCP:AUTH] Success: agent ${agent.id}`);
  return agent.id;
}

// --- OAuth 2.1 routes (for Claude Web MCP integration) ---

// Dynamic Client Registration
app.post("/oauth/register", async (c) => {
  const body = await c.req.json();
  const result = await handleRegister(body);
  return c.json(result.body, result.status);
});

// Authorize - render form
app.get("/oauth/authorize", async (c) => {
  const query = c.req.query();
  const result = await renderAuthorizePage(query);
  return c.html(result.html, result.status);
});

// Authorize - create agent & redirect with code
app.post("/oauth/authorize", async (c) => {
  const body = await c.req.parseBody();
  const result = await handleAuthorizeSubmit(body as Record<string, string>);
  if (result.status === 302) {
    return c.redirect(result.redirect!, 302);
  }
  return c.html(result.html!, result.status);
});

// Token exchange
app.post("/oauth/token", async (c) => {
  const body = await c.req.parseBody();
  const result = await handleToken(body as Record<string, string>);
  return c.json(result.body, result.status);
});

// --- MCP protocol handler ---

app.all("/", async (c) => {
  const agentId = await authenticateAgent(c.req.raw);
  if (!agentId) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid or missing API key" } },
      401,
    );
  }

  const response = await handleMcpRequest(c.req.raw, agentId);
  return response;
});

export default app;
