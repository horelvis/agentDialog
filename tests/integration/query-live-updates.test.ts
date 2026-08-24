import { describe, expect, it } from "bun:test";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";

/**
 * Every other message publishes `message.new` on the conversation's channel;
 * the two the query service writes never did. That was survivable while a
 * query lived on a page of its own — now the conversation is where a query is
 * asked and answered, and a chat that does not receive them shows a question
 * that never gets its answer until the page is reloaded.
 */

const app = createTestApp();

/** Resolves with the first message.new seen on the channel, or null. */
function waitForMessageNew(conversationId: string, timeoutMs = 5000) {
  const sub = new Redis(process.env.REDIS_URL!);
  return new Promise<any>((resolve) => {
    const done = (value: any) => {
      sub.quit().catch(() => {});
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    sub.subscribe(`conversation:${conversationId}`, () => {});
    sub.on("message", (_channel, payload) => {
      const event = JSON.parse(payload);
      if (event.type === "message.new") {
        clearTimeout(timer);
        done(event.data);
      }
    });
  });
}

describe("answering a query", () => {
  it("publishes the answer to the conversation, like any other message", async () => {
    const email = `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
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
    const { data } = await res.json();

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
    const human = await createTestHuman(email);

    const seen = waitForMessageNew(row.conversationId);
    // Give the subscription a moment to land before publishing.
    await new Promise((r) => setTimeout(r, 200));

    const respondRes = await app.request(`/api/v1/human/queries/${data.query_id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "boolean", value: true } }),
    });
    expect(respondRes.status).toBe(200);

    const message = await seen;
    expect(message).not.toBeNull();
    expect(message.type).toBe("human_query_response");
  });
});
