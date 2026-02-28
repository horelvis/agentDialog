import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { verifyApiKey } from "../lib/crypto";
import { UnauthorizedError } from "../lib/errors";

export const agentAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer mge_ag_")) {
    throw new UnauthorizedError("Missing or invalid API key");
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  const prefix = apiKey.slice(0, 15); // "mge_ag_" + 8 chars

  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyPrefix, prefix))
    .limit(1);

  if (!agent) {
    throw new UnauthorizedError("Invalid API key");
  }

  if (agent.status !== "active") {
    throw new UnauthorizedError(`Agent account is ${agent.status}`);
  }

  const valid = await verifyApiKey(apiKey, agent.apiKeyHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid API key");
  }

  c.set("agent", agent);
  c.set("agentId", agent.id);
  await next();
};
