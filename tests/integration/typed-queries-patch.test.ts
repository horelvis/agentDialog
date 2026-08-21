import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";

const app = createTestApp();

// Reuse the helper shape from typed-queries-respond.test.ts: a query in
// needs_context, with its human able to answer.
import { readyInNeedsContext } from "../helpers/queries";

describe("PATCH /agent/queries/:id", () => {
  it("returns the query to assigned and resumes the clock", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p1-${Date.now()}@example.com`);
    const db = getDb();
    const [before] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(before.pausedAt).not.toBeNull();

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({
        changes: [{ path: "Precio", before: "100", after: "120", materiality: "material" }],
      }),
    });
    expect(res.status).toBe(200);

    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(after.status).toBe("assigned");
    expect(after.pausedAt).toBeNull();
    // The clock was pushed forward by roughly the time it spent paused —
    // not merely left where it was, and not shifted by something unrelated.
    const shifted = after.expiresAt.getTime() - before.expiresAt.getTime();
    const paused = Date.now() - before.pausedAt!.getTime();
    expect(shifted).toBeGreaterThan(paused - 5_000);
    expect(shifted).toBeLessThan(paused + 5_000);
  });

  // The route returns whatever updateQuery returns. It must be the same
  // hand-shaped, snake_case object every other query surface returns — not
  // Drizzle's raw row, which is camelCase, keys the id as `id` rather than
  // `query_id`, and carries columns (agentId, humanId, conversationId,
  // queryMessageId, responseMessageId) no agent-facing response should leak.
  it("returns the shaped response, not the raw database row", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p5-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ context: "más contexto" }),
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.query_id).toBe(queryId);
    expect(data.status).toBe("assigned");
    for (const leaked of ["id", "agentId", "humanId", "conversationId", "queryMessageId", "responseMessageId"]) {
      expect(data[leaked]).toBeUndefined();
    }
  });

  it("refuses a PATCH from any state other than needs_context", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p2-${Date.now()}@example.com`);
    const db = getDb();
    await db.update(humanQueries).set({ status: "assigned", pausedAt: null })
      .where(eq(humanQueries.id, queryId));

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ context: "más contexto" }),
    });
    expect(res.status).toBe(409);
  });

  it("runs the patched query through admission again", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p3-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ subject: { id: "sin-referente", label: "Sin referente" } }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("missing_referent");
  });

  it("exhausts after two rounds, and unfreezes the clock so the query can expire", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`p4-${Date.now()}@example.com`);
    const db = getDb();
    // Pretend two rounds already happened.
    await db.update(humanQueries).set({ clarificationRounds: 2 }).where(eq(humanQueries.id, queryId));

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ context: "un intento más" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("clarification_rounds_exhausted");

    // Without this the query would stay frozen for ever.
    const [after] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(after.pausedAt).toBeNull();
  });
});
