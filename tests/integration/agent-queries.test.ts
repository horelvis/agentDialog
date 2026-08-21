import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";
import { readyInNeedsContext } from "../helpers/queries";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";

describe("Agent queries REST API", () => {
  const app = createTestApp();

  it("creates, reads and lists a query", async () => {
    const { authHeader } = await createTestAgent();

    const createRes = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation",
        subject: { id: "friday-deploy", label: "Friday deploy window", body: "Release notes for v2.3.0" },
        question: "Should we deploy on a Friday?",
        answer_space: { kind: "text", max_length: 500 },
        target_human_email: `queries-${Date.now()}@example.com`,
        timeout_minutes: 60,
      }),
    });
    expect(createRes.status).toBe(201);
    const { data: created } = await createRes.json();
    expect(created.query_id).toBeString();
    expect(created.status).toBe("pending");

    const getRes = await app.request(`/api/v1/agent/queries/${created.query_id}`, {
      headers: { Authorization: authHeader },
    });
    expect(getRes.status).toBe(200);
    const { data: fetched } = await getRes.json();
    expect(fetched.question).toBe("Should we deploy on a Friday?");
    expect(fetched.answer).toBeNull();

    const listRes = await app.request("/api/v1/agent/queries?limit=10", {
      headers: { Authorization: authHeader },
    });
    expect(listRes.status).toBe(200);
    const { data: list } = await listRes.json();
    expect(list.some((q: any) => q.query_id === created.query_id)).toBe(true);
  });

  it("rejects an invalid payload with 422", async () => {
    const { authHeader } = await createTestAgent();
    const res = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ query_type: "validation", question: "" }),
    });
    expect(res.status).toBe(422);
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/v1/agent/queries");
    expect(res.status).toBe(401);
  });

  it("does not leak another agent's query", async () => {
    const owner = await createTestAgent();
    const stranger = await createTestAgent();

    const createRes = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: owner.authHeader },
      body: JSON.stringify({
        query_type: "expert_query",
        subject: { id: "isolation-subject", label: "Isolation test subject", body: "Confidential memo excerpt" },
        question: "Private question",
        answer_space: { kind: "text", max_length: 500 },
        target_human_email: `isolation-${Date.now()}@example.com`,
      }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/api/v1/agent/queries/${created.query_id}`, {
      headers: { Authorization: stranger.authHeader },
    });
    expect(res.status).toBe(404);
  });

  it("does not leak another agent's query in the list route", async () => {
    const agentA = await createTestAgent();
    const agentB = await createTestAgent();

    const createA = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: agentA.authHeader },
      body: JSON.stringify({
        query_type: "expert_query",
        subject: { id: "list-isolation-a", label: "Agent A subject", body: "Agent A's referent" },
        question: "Question from agent A",
        answer_space: { kind: "text", max_length: 500 },
        target_human_email: `list-isolation-a-${Date.now()}@example.com`,
      }),
    });
    const { data: queryA } = await createA.json();

    const createB = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: agentB.authHeader },
      body: JSON.stringify({
        query_type: "expert_query",
        subject: { id: "list-isolation-b", label: "Agent B subject", body: "Agent B's referent" },
        question: "Question from agent B",
        answer_space: { kind: "text", max_length: 500 },
        target_human_email: `list-isolation-b-${Date.now()}@example.com`,
      }),
    });
    const { data: queryB } = await createB.json();

    const listA = await app.request("/api/v1/agent/queries?limit=100", {
      headers: { Authorization: agentA.authHeader },
    });
    const { data: listAData } = await listA.json();
    expect(listAData.some((q: any) => q.query_id === queryA.query_id)).toBe(true);
    expect(listAData.some((q: any) => q.query_id === queryB.query_id)).toBe(false);

    const listB = await app.request("/api/v1/agent/queries?limit=100", {
      headers: { Authorization: agentB.authHeader },
    });
    const { data: listBData } = await listB.json();
    expect(listBData.some((q: any) => q.query_id === queryB.query_id)).toBe(true);
    expect(listBData.some((q: any) => q.query_id === queryA.query_id)).toBe(false);
  });

  // needs_context hands the turn back to the agent, whose natural next move
  // is "list what's waiting on me" rather than polling every query it ever
  // created one at a time. The filter has to find it, and the listing must
  // not sweep it into "expired" along the way — its clock is paused, so a
  // deadline that has technically passed does not mean it timed out.
  it("finds a needs_context query via the status filter without expiring it", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`list-nc-${Date.now()}@example.com`);
    const db = getDb();
    await db.update(humanQueries)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(humanQueries.id, queryId));

    const res = await app.request("/api/v1/agent/queries?status=needs_context", {
      headers: { Authorization: agentAuth },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.some((q: any) => q.query_id === queryId)).toBe(true);

    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("needs_context");
  });
});
