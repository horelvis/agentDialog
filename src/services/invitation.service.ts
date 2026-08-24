import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { invitations } from "../db/schema/invitations";
import { agentTrustRevocations } from "../db/schema/trust-revocations";
import { conversationParticipants } from "../db/schema/participants";
import { humanQueries } from "../db/schema/human-queries";
import { humans } from "../db/schema/humans";
import { generateInvitationToken } from "../lib/crypto";
import { NotFoundError, ConflictError, ForbiddenError } from "../lib/errors";
import { sameEmail } from "../lib/email-identity";
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

  if (autoAccepted) {
    return { ...invitation, status: "accepted" as const, autoAccepted };
  }
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

  // The fourth place the ownership rule has to hold, and until now the one
  // where it did not. Holding the token was enough to create the participant
  // row — and from that row on, `respondQuery`, `listHumanQueries` and
  // `getQueryForHuman` all take the participant branch, where none of the
  // three email checks apply. So forwarding a query email let whoever
  // received it sign up, accept, and answer a decision addressed to somebody
  // else. `processEmailReply` was hardened against exactly this scenario; the
  // web path was not.
  const [human] = await db.select().from(humans).where(eq(humans.id, humanId)).limit(1);
  if (!sameEmail(human?.email, invitation.invitedHumanEmail)) {
    throw new ForbiddenError("This invitation was sent to a different address");
  }

  // Update invitation status
  await db
    .update(invitations)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  // Check-then-insert, the same guard respondQuery's acceptPendingInvitation
  // uses. There is still no unique constraint on (conversation_id, human_id),
  // so `.onConflictDoNothing()` would have nothing to conflict against and be
  // a silent no-op. One protected writer and one unprotected one is the worst
  // of the three options available: it looks fixed while duplicates keep
  // arriving through the other door.
  const [existingParticipant] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, invitation.conversationId),
        eq(conversationParticipants.humanId, humanId),
      ),
    )
    .limit(1);

  if (!existingParticipant) {
    await db.insert(conversationParticipants).values({
      conversationId: invitation.conversationId,
      actorType: "human",
      humanId,
      role: "participant",
    });
  }

  // A query owns its conversation, and `pending` is defined to the agent as
  // "the human has been invited but hasn't accepted the invitation yet. They
  // need to open the link in their email". The moment this call succeeds that
  // sentence is false, and it is the only thing the agent has to go on: it
  // will keep polling and reporting that nobody has looked.
  //
  // Until now nothing carried the acceptance across. `assigned` was reachable
  // only by trusting the agent beforehand, by clarifying out of
  // needs_context, or through the inbound email path that nothing calls — so
  // a first-time human accepting in the web app left the query reading
  // `pending` until they also answered.
  //
  // Scoped to this conversation and to rows still pending, so a query already
  // answered or cancelled is untouched.
  const assigned = await db
    .update(humanQueries)
    .set({ status: "assigned", humanId, updatedAt: new Date() })
    .where(
      and(
        eq(humanQueries.conversationId, invitation.conversationId),
        eq(humanQueries.status, "pending"),
      ),
    )
    .returning({ id: humanQueries.id });

  for (const q of assigned) {
    console.log(`[QUERY] Assigned ${q.id} to ${humanId} on invitation accept`);
  }

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
