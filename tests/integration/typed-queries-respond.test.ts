import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { conversationParticipants } from "../../src/db/schema/participants";
import { eq } from "drizzle-orm";

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
