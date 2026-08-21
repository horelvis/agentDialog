import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

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
});
