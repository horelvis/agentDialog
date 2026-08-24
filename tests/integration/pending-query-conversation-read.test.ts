import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";

/**
 * A query is answered in its conversation now, so the human has to be able to
 * read that conversation before they have accepted anything — and a `pending`
 * query is precisely one nobody has accepted yet.
 *
 * `listHumanQueries` already grants this: a pending query is visible to the
 * address it was sent to rather than to a participant row, "by the same
 * entitlement respondQuery uses". Reading the conversation that holds it is
 * the same entitlement; without it the query is listed and then leads to 403,
 * and a first-time human cannot answer at all.
 */

const app = createTestApp();

describe("the conversation holding a pending query", () => {
  it("is readable by the human it was addressed to", async () => {
    const email = `pending-read-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { authHeader } = await createTestAgent();

    const res = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation",
        risk: "low",
        subject: { id: `s-${Date.now()}`, label: "Contrato", body: "el texto" },
        question: "¿Firmamos?",
        answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
        target_human_email: email,
        timeout_minutes: 60,
      }),
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
    expect(row.status).toBe("pending");

    // They have never accepted anything: no participant row exists.
    const human = await createTestHuman(email);

    const msgRes = await app.request(
      `/api/v1/human/conversations/${row.conversationId}/messages`,
      { headers: { Authorization: human.authHeader } },
    );
    expect(msgRes.status).toBe(200);

    const { data: msgs } = await msgRes.json();
    expect(msgs.some((m: any) => m.type === "human_query")).toBe(true);
  });

  it("stays closed to a human it was not addressed to", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { authHeader } = await createTestAgent();

    const res = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation",
        risk: "low",
        subject: { id: `s-${stamp}`, label: "Contrato", body: "el texto" },
        question: "¿Firmamos?",
        answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
        target_human_email: `owner-${stamp}@example.com`,
        timeout_minutes: 60,
      }),
    });
    const { data } = await res.json();

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));

    // They need an invitation of their own simply to sign in, so give them a
    // query from some other agent. It must not open this conversation.
    const other = await createTestAgent();
    await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: other.authHeader },
      body: JSON.stringify({
        query_type: "validation",
        risk: "low",
        subject: { id: `other-${stamp}`, label: "Otra cosa", body: "otro texto" },
        question: "¿Otra pregunta?",
        answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
        target_human_email: `stranger-${stamp}@example.com`,
        timeout_minutes: 60,
      }),
    });

    const stranger = await createTestHuman(`stranger-${stamp}@example.com`);
    const msgRes = await app.request(
      `/api/v1/human/conversations/${row.conversationId}/messages`,
      { headers: { Authorization: stranger.authHeader } },
    );
    expect(msgRes.status).toBe(403);
  });
});
