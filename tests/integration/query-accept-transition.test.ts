import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { invitations } from "../../src/db/schema/invitations";
import { acceptInvitation } from "../../src/services/invitation.service";

/**
 * `pending` is defined to the agent as "the human has been invited but hasn't
 * accepted the invitation yet. They need to open the link in their email".
 * Once they have accepted, that sentence is false, and it is the only thing
 * the agent has to go on.
 */

const app = createTestApp();

async function pendingQuery(email: string) {
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation",
      risk: "low",
      subject: { id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "Reunión", body: "18:00" },
      question: "¿Puedes asistir hoy a la reunión de las 18:00?",
      answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
      target_human_email: email,
      timeout_minutes: 60,
    }),
  });
  expect(res.status).toBe(201);
  const { data } = await res.json();

  const db = getDb();
  const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
  const [invitation] = await db.select().from(invitations)
    .where(eq(invitations.conversationId, row.conversationId));

  return { queryId: row.id as string, token: invitation.token as string, status: row.status };
}

describe("accepting the invitation", () => {
  it("moves the query out of pending", async () => {
    const email = `accept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { queryId, token, status } = await pendingQuery(email);
    expect(status).toBe("pending");

    const human = await createTestHuman(email);
    await acceptInvitation(token, human.human.id);

    const db = getDb();
    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));

    // The agent is still being told they have not opened the invitation.
    expect(after.status).toBe("assigned");
    expect(after.humanId).toBe(human.human.id);
  });
});
