import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";
import { readyInNeedsContext } from "../helpers/queries";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";
import { queryResponse } from "../../src/validators/query.responses";

const app = createTestApp();

describe("POST /agent/queries/:id/cancel", () => {
  it("withdraws a query the human has not answered", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`c1-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: agentAuth },
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("cancelled");
  });

  // Same reasoning as the PATCH route: the raw Drizzle row is camelCase,
  // keys the id as `id`, and carries internal columns no agent-facing
  // response should leak.
  it("returns the shaped response, not the raw database row", async () => {
    const { queryId, agentAuth } = await readyInNeedsContext(`c4-${Date.now()}@example.com`);
    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: agentAuth },
    });
    expect(res.status).toBe(200);
    const resBody = await res.clone().json();
    expect(() => queryResponse.parse(resBody)).not.toThrow();
    const { data } = await res.json();

    expect(data.query_id).toBe(queryId);
    expect(data.status).toBe("cancelled");
    for (const leaked of ["id", "agentId", "humanId", "conversationId", "queryMessageId", "responseMessageId"]) {
      expect(data[leaked]).toBeUndefined();
    }
  });

  // Losing a person's decision to a race is exactly what cannot happen in a
  // system whose value is the record.
  it("loses to an answer that was already given", async () => {
    const { queryId, agentAuth, human } = await readyInNeedsContext(`c2-${Date.now()}@example.com`);

    await app.request(`/api/v1/human/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: human.authHeader },
      body: JSON.stringify({ outcome: "answer", answer: { kind: "choice", option_ids: ["yes"] } }),
    });

    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: agentAuth },
    });
    expect(res.status).toBe(409);

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, queryId));
    expect(row.status).toBe("answered");
    expect(row.answer).toEqual({ kind: "choice", option_ids: ["yes"] });
  });

  it("refuses to cancel another agent's query", async () => {
    const { queryId } = await readyInNeedsContext(`c3-${Date.now()}@example.com`);
    const { createTestAgent } = await import("../helpers");
    const stranger = await createTestAgent();
    const res = await app.request(`/api/v1/agent/queries/${queryId}/cancel`, {
      method: "POST", headers: { Authorization: stranger.authHeader },
    });
    expect(res.status).toBe(404);
  });
});
