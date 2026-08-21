import { describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { invitations } from "../../src/db/schema/invitations";
import { conversationParticipants } from "../../src/db/schema/participants";
import { acceptInvitation } from "../../src/services/invitation.service";

/**
 * I4. Holding the token used to be enough to become a participant, and from
 * that row on every human-facing surface takes the participant branch, where
 * none of the email checks apply. Forward a query email and whoever receives
 * it could sign up, accept, and answer a decision addressed to somebody else.
 */

const app = createTestApp();

async function queryWithInvitation(targetEmail: string) {
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation",
      subject: { id: `inv-${Date.now()}`, label: "Contrato", body: "el texto" },
      question: "¿Firmamos?",
      answer_space: { kind: "text", max_length: 500 },
      target_human_email: targetEmail,
      timeout_minutes: 60,
    }),
  });
  expect(res.status).toBe(201);
  const { data } = await res.json();

  const db = getDb();
  const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
  const [invitation] = await db.select().from(invitations)
    .where(eq(invitations.conversationId, row.conversationId));

  return { queryId: row.id as string, conversationId: row.conversationId as string, token: invitation.token as string };
}

describe("acceptInvitation ownership", () => {
  it("refuses a human whose address is not the one the invitation was sent to", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const target = `owner-${stamp}@example.com`;
    const { conversationId, token } = await queryWithInvitation(target);

    // The forwardee. They have their own invitation from some agent, so they
    // can sign in; that must not let them accept somebody else's.
    const otherStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const otherTarget = `stranger-${otherStamp}@example.com`;
    await queryWithInvitation(otherTarget);
    const stranger = await createTestHuman(otherTarget);

    await expect(acceptInvitation(token, stranger.human.id)).rejects.toThrow(
      /sent to a different address/i,
    );

    // And nothing was created on their behalf.
    const db = getDb();
    const participants = await db.select().from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.humanId, stranger.human.id),
      ));
    expect(participants).toHaveLength(0);

    const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
    expect(invitation.status).toBe("pending");
  });

  it("still lets the person it was addressed to accept it", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const target = `owner-ok-${stamp}@example.com`;
    const { conversationId, token } = await queryWithInvitation(target);
    const human = await createTestHuman(target);

    await acceptInvitation(token, human.human.id);

    const db = getDb();
    const participants = await db.select().from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.humanId, human.human.id),
      ));
    expect(participants).toHaveLength(1);
  });

  // The other half of I4: one guarded writer and one unguarded one is the
  // worst of the three options, because it looks fixed while duplicates keep
  // arriving through the other door. There is still no unique constraint on
  // (conversation_id, human_id), so this is the only thing stopping them.
  it("does not create a second participant row when the same human is already one", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const target = `dup-${stamp}@example.com`;
    const { conversationId, token } = await queryWithInvitation(target);
    const human = await createTestHuman(target);

    const db = getDb();
    // Already a participant — as they would be after answering, or after any
    // other path that inserts the row first.
    await db.insert(conversationParticipants).values({
      conversationId,
      actorType: "human",
      humanId: human.human.id,
      role: "participant",
    });

    await acceptInvitation(token, human.human.id);

    const participants = await db.select().from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.humanId, human.human.id),
      ));
    expect(participants).toHaveLength(1);
  });
});
