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
  const allHumans = await db.select().from(humans);

  for (const human of allHumans) {
    if (!human.sessionTokenHash || !human.sessionExpiresAt) continue;
    if (new Date() > human.sessionExpiresAt) continue;

    const valid = await verifyToken(sessionToken, human.sessionTokenHash);
    if (valid) {
      return { actorType: "human" as const, actorId: human.id };
    }
  }

  return null;
}
