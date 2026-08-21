import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";
import { processEmailReply } from "../../src/services/email-response.service";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { invitations } from "../../src/db/schema/invitations";
import { conversationParticipants } from "../../src/db/schema/participants";
import { and, eq } from "drizzle-orm";

/**
 * The sender check used to warn and carry on, so anyone the query email was
 * forwarded to could answer in the target's name and the agent could not tell.
 */

async function createQuery(targetEmail: string, over: Record<string, unknown> = {}) {
  const app = createTestApp();
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation",
      subject: { id: "sender-check", label: "Sender verification subject", body: "Draft release notes" },
      question: "Is this reply from the right person?",
      answer_space: { kind: "text", max_length: 500 },
      target_human_email: targetEmail,
      timeout_minutes: 60,
      ...over,
    }),
  });
  expect(res.status).toBe(201);
  const { data } = await res.json();
  return { app, authHeader, queryId: data.query_id as string };
}

describe("processEmailReply sender verification", () => {
  it("rejects a reply from someone other than the target and leaves the query alone", async () => {
    const target = `target-${Date.now()}@example.com`;
    const { app, authHeader, queryId } = await createQuery(target);

    const result = await processEmailReply({
      queryId,
      senderEmail: `intruder-${Date.now()}@example.com`,
      replyText: "Yes, ship it.",
    });

    expect(result).toEqual({ sender_mismatch: true });

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      headers: { Authorization: authHeader },
    });
    const { data } = await res.json();
    expect(data.status).toBe("pending");
    expect(data.answer).toBeNull();
  });

  it("accepts a reply from the target, and is idempotent afterwards", async () => {
    const target = `target-${Date.now()}-ok@example.com`;
    const { app, authHeader, queryId } = await createQuery(target);

    const result = await processEmailReply({
      queryId,
      senderEmail: target,
      replyText: "Yes, ship it.",
    });
    expect(result).toEqual({ success: true, query_id: queryId });

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      headers: { Authorization: authHeader },
    });
    const { data } = await res.json();
    expect(data.status).toBe("answered");
    // An email reply is always free text — there is no way to make someone
    // pick from a rendered choice list inside a mail client — so it is always
    // wrapped as a {kind:"text", value:...} typed answer.
    expect(data.answer).toEqual({ kind: "text", value: "Yes, ship it." });

    // A second pass over the same message must not disturb the answer.
    const again = await processEmailReply({
      queryId,
      senderEmail: target,
      replyText: "Yes, ship it.",
    });
    expect(again).toEqual({ already_answered: true });
  });

  it("ignores case and surrounding whitespace when comparing addresses", async () => {
    const target = `target-${Date.now()}-case@example.com`;
    const { queryId } = await createQuery(target);

    const result = await processEmailReply({
      queryId,
      senderEmail: `  ${target.toUpperCase()} `,
      replyText: "Fine by me.",
    });
    expect(result).toEqual({ success: true, query_id: queryId });
  });

  /**
   * I5. An email reply is always free text, and `validateAnswerAgainstSpace`
   * refuses `{kind:"text"}` for every space but `text`. The refusal used to
   * come AFTER the invitation had been accepted, the participant row inserted
   * and the query moved to `assigned` — a 422 escaping the handler with all
   * the side effects already applied.
   */
  it("refuses a non-text answer space without touching anything first", async () => {
    const target = `target-${Date.now()}-typed@example.com`;
    const { app, authHeader, queryId } = await createQuery(target, {
      answer_space: {
        kind: "choice",
        select: "one",
        options: [{ id: "ship", label: "Ship" }, { id: "hold", label: "Hold" }],
      },
    });

    const result = await processEmailReply({
      queryId,
      senderEmail: target,
      replyText: "Ship it.",
    });
    expect(result).toEqual({ answer_space_not_text: true, kind: "choice" });

    // The point of the fix: nothing moved. The query is still `pending`, so
    // the invitation was not accepted and no participant row was created.
    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      headers: { Authorization: authHeader },
    });
    const { data } = await res.json();
    expect(data.status).toBe("pending");
    expect(data.answer).toBeNull();

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.humanId).toBeNull();

    const invitationRows = await db.select().from(invitations)
      .where(eq(invitations.conversationId, row.conversationId));
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0].status).toBe("pending");

    const participants = await db.select().from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, row.conversationId),
        eq(conversationParticipants.actorType, "human"),
      ));
    expect(participants).toHaveLength(0);
  });

  it("reports a query that does not exist", async () => {
    const result = await processEmailReply({
      queryId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      senderEmail: "someone@example.com",
      replyText: "Hello?",
    });
    expect(result).toEqual({ not_found: true });
  });
});
