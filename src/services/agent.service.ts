import { eq } from "drizzle-orm";
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
    })
    .returning();

  return { agent, apiKey: key };
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
