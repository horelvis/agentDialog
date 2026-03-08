import { Hono } from "hono";
import { eq, and, notInArray, sql } from "drizzle-orm";
import type { AppEnv } from "../../types/hono";
import { getDb } from "../../db";
import { invitations } from "../../db/schema/invitations";
import { agentTrustRevocations } from "../../db/schema/trust-revocations";
import { agents } from "../../db/schema/agents";
import { ConflictError, NotFoundError } from "../../lib/errors";

const app = new Hono<AppEnv>();

// List trusted agents (agents with accepted invitations, not revoked)
app.get("/trusted-agents", async (c) => {
  const human = c.get("human");
  const humanId = c.get("humanId");
  const db = getDb();

  // Get agent IDs that have been revoked
  const revokedAgentIds = db
    .select({ agentId: agentTrustRevocations.agentId })
    .from(agentTrustRevocations)
    .where(eq(agentTrustRevocations.humanId, humanId));

  // Get distinct agents with accepted invitations, excluding revoked ones
  const trustedAgents = await db
    .selectDistinctOn([invitations.invitedByAgentId], {
      agentId: invitations.invitedByAgentId,
      displayName: agents.displayName,
      slug: agents.slug,
      avatarUrl: agents.avatarUrl,
      description: agents.description,
      firstAcceptedAt: sql<string>`min(${invitations.updatedAt}) over (partition by ${invitations.invitedByAgentId})`,
    })
    .from(invitations)
    .innerJoin(agents, eq(agents.id, invitations.invitedByAgentId))
    .where(
      and(
        eq(invitations.invitedHumanEmail, human.email),
        eq(invitations.status, "accepted"),
        notInArray(invitations.invitedByAgentId, revokedAgentIds),
      ),
    );

  return c.json({ data: trustedAgents });
});

// Revoke trust for an agent
app.post("/trusted-agents/:agentId/revoke", async (c) => {
  const agentId = c.req.param("agentId");
  const humanId = c.get("humanId");
  const human = c.get("human");
  const db = getDb();

  // Verify the agent exists
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) throw new NotFoundError("Agent", agentId);

  // Verify there's actually a trust relationship to revoke
  const [acceptedInvitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.invitedByAgentId, agentId),
        eq(invitations.invitedHumanEmail, human.email),
        eq(invitations.status, "accepted"),
      ),
    )
    .limit(1);

  if (!acceptedInvitation) {
    throw new NotFoundError("Trust relationship");
  }

  // Insert revocation (upsert to handle duplicates gracefully)
  await db
    .insert(agentTrustRevocations)
    .values({ agentId, humanId })
    .onConflictDoNothing();

  return c.json({ data: { agentId, revoked: true } });
});

export default app;
