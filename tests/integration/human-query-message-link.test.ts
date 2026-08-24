import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { invitations } from "../../src/db/schema/invitations";
import { acceptInvitation } from "../../src/services/invitation.service";

/**
 * The chat is the only place a human answers, so the renderer has to know
 * which message in the conversation is the query. The link exists in the
 * database — human_queries.query_message_id — but only pointed one way: the
 * human's side received the query without ever being told which message it
 * belongs to.
 *
 * Matching on conversation_id alone would work today, because createQuery
 * opens a conversation per query. That is an invariant nobody promised, and
 * multi-human queries would break it silently.
 */

const app = createTestApp();

describe("a query the human receives", () => {
  it("names the message it belongs to", async () => {
    const email = `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { authHeader } = await createTestAgent();

    const res = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation",
        risk: "low",
        subject: { id: `s-${Date.now()}`, label: "Contrato", body: "el texto" },
        question: "¿Firmamos?",
        answer_space: {
          kind: "choice",
          select: "one",
          options: [
            { id: "yes", label: "Sí", consequence: "Firmo." },
            { id: "no", label: "No", consequence: "No firmo." },
          ],
        },
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

    const human = await createTestHuman(email);
    await acceptInvitation(invitation.token as string, human.human.id);

    const listed = await app.request("/api/v1/human/queries", {
      headers: { Authorization: human.authHeader },
    });
    expect(listed.status).toBe(200);
    const { data: queries } = await listed.json();

    const mine = queries.find((q: any) => q.query_id === row.id);
    expect(mine).toBeDefined();

    // Matched the way the chat matches it: against the conversation's messages
    // as the human's own client receives them, not against the database.
    const msgRes = await app.request(
      `/api/v1/human/conversations/${row.conversationId}/messages`,
      { headers: { Authorization: human.authHeader } },
    );
    expect(msgRes.status).toBe(200);
    const { data: conversationMessages } = await msgRes.json();

    const rendered = conversationMessages.find(
      (m: any) => m.id === mine.query_message_id,
    );
    expect(rendered).toBeDefined();
    expect(rendered.type).toBe("human_query");
    // And what it needs to render it.
    expect(mine.answer_space).toBeDefined();
    expect(mine.conversation_id).toBe(row.conversationId);
  });
});
