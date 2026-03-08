import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { verifyApiKey } from "../lib/crypto";
import { handleMcpRequest } from "../mcp/transport";

const app = new Hono();

// Authenticate agent from Bearer token for MCP requests
async function authenticateAgent(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer mge_ag_")) return null;

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  const prefix = apiKey.slice(0, 15); // "mge_ag_" + 8 chars

  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyPrefix, prefix))
    .limit(1);

  if (!agent || agent.status !== "active") return null;

  const valid = await verifyApiKey(apiKey, agent.apiKeyHash);
  if (!valid) return null;

  return agent.id;
}

// All MCP methods go through the same handler
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
