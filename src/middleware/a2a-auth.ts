import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/hono";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { verifyApiKey } from "../lib/crypto";
import { NotFoundError, UnauthorizedError } from "../lib/errors";

/**
 * Extract a Bearer token from an Authorization header. Returns null when the
 * header is missing or not a Bearer scheme.
 */
export function extractBearer(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/**
 * Look up an agent by API key. Returns null when the key is malformed, the
 * agent does not exist, the account is not active, or the key hash does not
 * match. The result is separated from HTTP concerns so it can be unit tested
 * with an in-memory store.
 */
export async function authenticateApiKey(
  apiKey: string,
  db = getDb(),
): Promise<typeof agents.$inferSelect | null> {
  if (!apiKey.startsWith("mge_ag_")) return null;
  const prefix = apiKey.slice(0, 15);

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyPrefix, prefix))
    .limit(1);

  if (!agent) return null;
  if (agent.status !== "active") return null;

  // Lazy expiry, mirroring agent-auth: the sweep flips status, but an expired
  // agent must stop authenticating the moment it expires, not five minutes later.
  if (agent.expiresAt && agent.expiresAt.getTime() <= Date.now()) return null;

  const valid = await verifyApiKey(apiKey, agent.apiKeyHash);
  if (!valid) return null;

  return agent;
}

/**
 * Authenticate the caller of a public A2A endpoint. The caller must be a
 * registered, active agent. The request is addressed to the agent identified by
 * `:agentSlug`, which is resolved but not required to belong to the caller.
 */
export const a2aSenderAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractBearer(c.req.header("Authorization"));
  if (!token) throw new UnauthorizedError("Missing or invalid API key");

  const agent = await authenticateApiKey(token);
  if (!agent) throw new UnauthorizedError("Invalid API key");

  c.set("a2aSenderAgent", agent);
  c.set("a2aSenderAgentId", agent.id);
  await next();
};

/**
 * Resolve the recipient agent identified by `:agentSlug` on public A2A routes.
 * This is done after sender authentication so the response does not leak whether
 * an arbitrary slug exists to an unauthenticated caller.
 */
export const a2aResolveRecipient: MiddlewareHandler<AppEnv> = async (c, next) => {
  const slug = c.req.param("agentSlug") ?? "";
  const db = getDb();

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.status !== "active") {
    throw new NotFoundError("Agent", slug);
  }

  c.set("a2aRecipientAgent", agent);
  c.set("a2aRecipientAgentId", agent.id);
  await next();
};

/**
 * Authenticate the owner of an A2A mailbox on agent-only endpoints. The caller
 * must be a registered, active agent, and every subsequent operation must act
 * on tasks addressed to that agent.
 */
export const a2aRecipientAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractBearer(c.req.header("Authorization"));
  if (!token) throw new UnauthorizedError("Missing or invalid API key");

  const agent = await authenticateApiKey(token);
  if (!agent) throw new UnauthorizedError("Invalid API key");

  c.set("a2aRecipientAgent", agent);
  c.set("a2aRecipientAgentId", agent.id);
  await next();
};
