import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { humans } from "../db/schema/humans";
import { verifyApiKey, verifyToken } from "../lib/crypto";

export async function authenticateWs(
  token: string,
): Promise<{ actorType: "agent" | "human"; actorId: string } | null> {
  if (token.startsWith("mge_ag_")) {
    return authenticateAgentWs(token);
  }
  if (token.startsWith("sess_")) {
    return authenticateHumanWs(token);
  }
  return null;
}

async function authenticateAgentWs(apiKey: string) {
  const db = getDb();
  const prefix = apiKey.slice(0, 15);
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyPrefix, prefix))
    .limit(1);

  if (!agent || agent.status !== "active") return null;

  const valid = await verifyApiKey(apiKey, agent.apiKeyHash);
  if (!valid) return null;

  return { actorType: "agent" as const, actorId: agent.id };
}

async function authenticateHumanWs(sessionToken: string) {
  const db = getDb();
  const prefix = sessionToken.slice(0, 15);

  const [human] = await db
    .select()
    .from(humans)
    .where(eq(humans.sessionTokenPrefix, prefix))
    .limit(1);

  if (!human?.sessionTokenHash || !human.sessionExpiresAt) return null;
  if (new Date() > human.sessionExpiresAt) return null;

  const valid = await verifyToken(sessionToken, human.sessionTokenHash);
  if (!valid) return null;

  return { actorType: "human" as const, actorId: human.id };
}
