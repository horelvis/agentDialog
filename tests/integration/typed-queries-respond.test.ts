import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { conversationParticipants } from "../../src/db/schema/participants";
import { invitations } from "../../src/db/schema/invitations";
import { eq, and } from "drizzle-orm";

const app = createTestApp();

const space = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

/** Creates a query and puts the human in a position to answer it. */
async function ready(email: string) {
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation", risk: "low",
      subject: { id: `s-${Date.now()}`, label: "S", body: "x" },
      question: "¿Seguimos?", answer_space: space,
      target_human_email: email, timeout_minutes: 60,
    }),
  });
  const { data } = await res.json();
  const human = await createTestHuman(email);
  const db = getDb();
  const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
  await db.insert(conversationParticipants).values({
    conversationId: row.conversationId, actorType: "human",
    humanId: human.human.id, role: "participant",
  }).onConflictDoNothing();
  await db.update(humanQueries).set({ status: "assigned", humanId: human.human.id })
    .where(eq(humanQueries.id, row.id));
  return { queryId: row.id, human, agentAuth: authHeader };
}

describe("respuesta tipada", () => {
  it("records a structured answer", async () => {
    const { queryId, human } = await ready(`r1-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });
    expect(res.status).toBe(200);
    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("answered");
    expect(row.answer).toEqual({ kind: "choice", option_ids: ["yes"] });
  });

  it("refuses an option that was never offered", async () => {
    const { queryId, human } = await ready(`r2-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["inventado"] } }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses an answer whose kind does not match the space", async () => {
    const { queryId, human } = await ready(`r3-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "boolean", value: true } }),
    });
    expect(res.status).toBe(422);
  });
});

describe("insufficient_context", () => {
  it("returns the turn without closing the query, and freezes the clock", async () => {
    const { queryId, human } = await ready(`r4-${Date.now()}@example.com`);
    const db = getDb();
    const [before] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));

    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "missing_delta",
                             note: "¿qué ha cambiado?" }),
    });
    expect(res.status).toBe(200);

    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(after.status).toBe("needs_context");
    expect(after.insufficientReason).toBe("missing_delta");
    expect(after.clarificationRounds).toBe(1);
    expect(after.pausedAt).not.toBeNull();
    expect(after.answer).toBeNull();
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("refuses a reason outside the closed set", async () => {
    const { queryId, human } = await ready(`r5-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "porque no me apetece" }),
    });
    expect(res.status).toBe(422);
  });

  it("accepts not_my_decision, which is not a lack of context", async () => {
    const { queryId, human } = await ready(`r6-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "not_my_decision" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("answering a pending query (the real accept path)", () => {
  /**
   * Only creates the query — deliberately does not touch conversationParticipants
   * or humanQueries.status. That is the whole point of this block: the existing
   * `ready()` helper above sets status: "assigned" directly via SQL, which is
   * exactly what hid the bug this suite now guards against. A human who has
   * never accepted anything from this agent must still be able to answer their
   * very first query, through nothing but the real HTTP surface.
   */
  async function createPendingQuery(email: string) {
    const { agent, authHeader } = await createTestAgent();
    const res = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation", risk: "low",
        subject: { id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "S", body: "x" },
        question: "¿Seguimos?", answer_space: space,
        target_human_email: email, timeout_minutes: 60,
      }),
    });
    const { data } = await res.json();
    expect(data.status).toBe("pending");
    return { queryId: data.query_id, conversationId: data.conversation_id, agentId: agent.id };
  }

  it("is visible to a first-time human through the real read path, and answering accepts it", async () => {
    const email = `first-time-${Date.now()}@example.com`;
    const { queryId, conversationId } = await createPendingQuery(email);

    // The real sign-in path: createTestHuman only succeeds because createQuery
    // above left a pending invitation for this address — nothing here inserts
    // a participant or touches humanQueries.
    const human = await createTestHuman(email);

    const db = getDb();
    const [before] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(before.status).toBe("pending");

    // The real UI never learns a queryId out of band — it lists, then opens.
    // Both reads must work with no participant row yet, the same entitlement
    // respondQuery uses (the query's own target address).
    const listRes = await app.request("/api/v1/human/queries", {
      headers: { Authorization: human.authHeader },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.map((q: { query_id: string }) => q.query_id)).toContain(queryId);

    const getRes = await app.request(`/api/v1/human/queries/${queryId}`, {
      headers: { Authorization: human.authHeader },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.query_id).toBe(queryId);
    expect(getBody.data.status).toBe("pending");

    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("answered");

    const [afterQuery] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(afterQuery.status).toBe("answered");
    expect(afterQuery.humanId).toBe(human.human.id);
    expect(afterQuery.answer).toEqual({ kind: "choice", option_ids: ["yes"] });

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.conversationId, conversationId), eq(invitations.invitedHumanEmail, email)));
    expect(invitation.status).toBe("accepted");

    const participantRows = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.humanId, human.human.id),
        ),
      );
    expect(participantRows).toHaveLength(1);
    expect(participantRows[0].actorType).toBe("human");
  });

  it("does not leave a duplicate participant row when the invitation was already accepted separately", async () => {
    // Reproduces the exact shape of the finding: a human who reaches the
    // query through /app/invitations (POST .../accept, which already
    // inserts a participant row via acceptInvitation) and then answers.
    // Without the explicit existence check, acceptPendingInvitation's own
    // insert would add a second row for the same (conversation, human) pair,
    // since conversation_participants has no unique constraint to fall back on.
    const email = `already-accepted-${Date.now()}@example.com`;
    const { queryId, conversationId } = await createPendingQuery(email);
    const human = await createTestHuman(email);

    const db = getDb();
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.conversationId, conversationId), eq(invitations.invitedHumanEmail, email)));

    const acceptRes = await app.request(`/api/v1/human/invitations/${invitation.token}/accept`, {
      method: "POST",
      headers: { Authorization: human.authHeader },
    });
    expect(acceptRes.status).toBe(200);

    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });
    expect(res.status).toBe(200);

    const participantRows = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.humanId, human.human.id),
        ),
      );
    expect(participantRows).toHaveLength(1);
  });

  it("also accepts the invitation when the first answer is insufficient_context", async () => {
    const email = `first-time-nc-${Date.now()}@example.com`;
    const { queryId, conversationId } = await createPendingQuery(email);
    const human = await createTestHuman(email);

    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "insufficient_context", reason: "unknown_subject" }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const [afterQuery] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(afterQuery.status).toBe("needs_context");
    expect(afterQuery.humanId).toBe(human.human.id);

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.conversationId, conversationId), eq(invitations.invitedHumanEmail, email)));
    expect(invitation.status).toBe("accepted");
  });

  it("refuses to let a different human answer someone else's pending invitation", async () => {
    const targetEmail = `target-${Date.now()}@example.com`;
    const { queryId } = await createPendingQuery(targetEmail);

    // The stranger needs a session of their own to reach the entitlement
    // check at all — sign-in itself is gated on having an invitation
    // (createVerificationCode), so a true never-invited stranger cannot even
    // authenticate. The real risk is a human who is legitimately signed in
    // for THEIR OWN query trying to reuse that session on somebody else's
    // pending invitation. Give them a genuine query/invitation from a
    // second agent, then have them target the first one.
    const strangerEmail = `stranger-${Date.now()}@example.com`;
    await createPendingQuery(strangerEmail);
    const stranger = await createTestHuman(strangerEmail);

    const res = await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: stranger.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });
    expect(res.status).toBe(403);

    const db = getDb();
    const [afterQuery] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(afterQuery.status).toBe("pending");
    expect(afterQuery.humanId).toBeNull();

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.conversationId, afterQuery.conversationId), eq(invitations.invitedHumanEmail, targetEmail)));
    expect(invitation.status).toBe("pending");
  });
});
