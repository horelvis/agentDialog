import { eq, lt, and } from "drizzle-orm";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { generateApiKey, hashApiKey } from "../lib/crypto";
import { ConflictError, NotFoundError } from "../lib/errors";
import type { AgentRegisterInput, AgentUpdateInput } from "../validators/agent.validators";

export async function registerAgent(input: AgentRegisterInput) {
  const db = getDb();

  const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.slug, input.slug)).limit(1);
  if (existing.length > 0) {
    throw new ConflictError(`Agent slug '${input.slug}' is already taken`);
  }

  const { key, prefix } = generateApiKey();
  const apiKeyHash = await hashApiKey(key);

  const expiresAt = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000)
    : null;

  const [agent] = await db
    .insert(agents)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
      avatarUrl: input.avatarUrl,
      homepageUrl: input.homepageUrl,
      provider: input.provider,
      model: input.model,
      capabilities: input.capabilities || [],
      apiKeyHash,
      apiKeyPrefix: prefix,
      metadata: input.metadata || {},
      agentCard: input.agentCard,
      expiresAt,
    })
    .returning();

  return { agent, apiKey: key };
}

/**
 * Deactivate every agent whose self-declared lifetime has passed. Idempotent
 * by construction — an agent already deactivated is not active, so the WHERE
 * skips it. Runs periodically from src/index.ts on every instance; on a
 * multi-instance deploy each one sweeps and they cannot interfere.
 */
export async function deactivateExpiredAgents(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(agents)
    .set({ status: "deactivated", updatedAt: now })
    .where(and(lt(agents.expiresAt, now), eq(agents.status, "active")))
    .returning({ id: agents.id });

  return rows.length;
}

export async function getAgentById(id: string) {
  const db = getDb();
  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!agent) throw new NotFoundError("Agent", id);
  return agent;
}

export async function updateAgent(id: string, input: AgentUpdateInput) {
  const db = getDb();
  const [agent] = await db
    .update(agents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();
  if (!agent) throw new NotFoundError("Agent", id);
  return agent;
}

export async function rotateApiKey(id: string) {
  const db = getDb();
  const { key, prefix } = generateApiKey();
  const apiKeyHash = await hashApiKey(key);

  const [agent] = await db
    .update(agents)
    .set({ apiKeyHash, apiKeyPrefix: prefix, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();

  if (!agent) throw new NotFoundError("Agent", id);
  return { agent, apiKey: key };
}
