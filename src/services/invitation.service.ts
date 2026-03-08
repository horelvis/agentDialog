import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { invitations } from "../db/schema/invitations";
import { agentTrustRevocations } from "../db/schema/trust-revocations";
import { conversationParticipants } from "../db/schema/participants";
import { humans } from "../db/schema/humans";
import { generateInvitationToken } from "../lib/crypto";
import { NotFoundError, ConflictError, ForbiddenError } from "../lib/errors";
import { getOrCreateHuman } from "./human.service";
import type { CreateInvitationInput } from "../validators/invitation.validators";

export async function createInvitation(
  conversationId: string,
  agentId: string,
  input: CreateInvitationInput,
) {
  const db = getDb();

  // Check for existing pending invitation
  const [existing] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.conversationId, conversationId),
        eq(invitations.invitedHumanEmail, input.email),
        eq(invitations.status, "pending"),
      ),
    )
    .limit(1);

  if (existing) {
    throw new ConflictError("An invitation for this email already exists for this conversation");
  }

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3600 * 1000);

  const [invitation] = await db
    .insert(invitations)
    .values({
      conversationId,
      invitedByAgentId: agentId,
      invitedHumanEmail: input.email,
      token,
      message: input.message,
      expiresAt,
    })
    .returning();

  // Check if the human has a prior trust relationship with this agent
  const autoAccepted = await tryAutoAccept(invitation, agentId, input.email);

  return { ...invitation, autoAccepted };
}

async function tryAutoAccept(
  invitation: { id: string; conversationId: string; invitedHumanEmail: string },
  agentId: string,
  email: string,
): Promise<boolean> {
  const db = getDb();

  // Find the human by email
  const [human] = await db
    .select()
    .from(humans)
    .where(eq(humans.email, email))
    .limit(1);

  if (!human) return false;

  // Check for a prior accepted invitation from this agent to this human
  const [priorAccepted] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.invitedByAgentId, agentId),
        eq(invitations.invitedHumanEmail, email),
        eq(invitations.status, "accepted"),
      ),
    )
    .limit(1);

  if (!priorAccepted) return false;

  // Check that the human has NOT revoked trust
  const [revocation] = await db
    .select()
    .from(agentTrustRevocations)
    .where(
      and(
        eq(agentTrustRevocations.agentId, agentId),
        eq(agentTrustRevocations.humanId, human.id),
      ),
    )
    .limit(1);

  if (revocation) return false;

  // Auto-accept: update invitation status and add human as participant
  await db
    .update(invitations)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  await db.insert(conversationParticipants).values({
    conversationId: invitation.conversationId,
    actorType: "human",
    humanId: human.id,
    role: "participant",
  });

  return true;
}

export async function acceptInvitation(token: string, humanId: string) {
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), eq(invitations.status, "pending")))
    .limit(1);

  if (!invitation) throw new NotFoundError("Invitation");
  if (new Date() > invitation.expiresAt) {
    await db.update(invitations).set({ status: "expired" }).where(eq(invitations.id, invitation.id));
    throw new ForbiddenError("Invitation has expired");
  }

  // Update invitation status
  await db
    .update(invitations)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  // Add human as participant
  await db.insert(conversationParticipants).values({
    conversationId: invitation.conversationId,
    actorType: "human",
    humanId,
    role: "participant",
  });

  return invitation;
}

export async function declineInvitation(token: string) {
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), eq(invitations.status, "pending")))
    .limit(1);

  if (!invitation) throw new NotFoundError("Invitation");

  await db
    .update(invitations)
    .set({ status: "declined", updatedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  return invitation;
}

export async function revokeInvitation(invitationId: string, agentId: string) {
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(eq(invitations.id, invitationId), eq(invitations.invitedByAgentId, agentId)),
    )
    .limit(1);

  if (!invitation) throw new NotFoundError("Invitation", invitationId);
  if (invitation.status !== "pending") {
    throw new ForbiddenError("Can only revoke pending invitations");
  }

  await db
    .update(invitations)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(invitations.id, invitationId));

  return invitation;
}

export async function listConversationInvitations(conversationId: string) {
  const db = getDb();
  return db
    .select()
    .from(invitations)
    .where(eq(invitations.conversationId, conversationId));
}

export async function listHumanInvitations(email: string) {
  const db = getDb();
  return db
    .select()
    .from(invitations)
    .where(
      and(eq(invitations.invitedHumanEmail, email), eq(invitations.status, "pending")),
    );
}
