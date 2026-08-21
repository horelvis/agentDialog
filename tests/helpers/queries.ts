import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "./index";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { conversationParticipants } from "../../src/db/schema/participants";

const SPACE = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

/** A query sitting in needs_context, with its clock paused. */
export async function readyInNeedsContext(email: string) {
  const app = createTestApp();
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation", risk: "low",
      subject: { id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "S", body: "x" },
      question: "¿Seguimos?", answer_space: SPACE,
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
  await db.update(humanQueries).set({
    status: "needs_context", humanId: human.human.id,
    clarificationRounds: 1, pausedAt: new Date(Date.now() - 60_000),
    insufficientReason: "missing_delta",
  }).where(eq(humanQueries.id, row.id));

  return { queryId: row.id, human, agentAuth: authHeader, conversationId: row.conversationId };
}
