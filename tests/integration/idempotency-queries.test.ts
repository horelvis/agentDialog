import { describe, expect, it, beforeAll } from "bun:test";
import { createTestApp } from "../helpers";

/**
 * The route that matters most: a duplicate here is a second email to the same
 * person about the same decision, with two links resolving two queries.
 */
describe("Idempotent query creation", () => {
  const app = createTestApp();
  let apiKey: string;

  beforeAll(async () => {
    // One registration per file: the budget is ten per hour across the suite.
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `idem-queries-${Date.now()}`,
        displayName: "Idempotency Test Agent",
      }),
    });
    apiKey = (await res.json()).data.apiKey;
  });

  function createQuery(key: string | undefined, question: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (key) headers["Idempotency-Key"] = key;

    return app.request("/api/v1/agent/queries", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query_type: "validation",
        risk: "low",
        subject: {
          id: "q4-revenue",
          label: "Q4 revenue figure",
          body: "Q4 revenue: 2,300,000 EUR (+15% YoY), from finance.quarterly_revenue.",
        },
        answer_space: { kind: "boolean", labels: { t: "Correct", f: "Incorrect" } },
        question,
        target_human_email: "idem@example.com",
        timeout_minutes: 30,
      }),
    });
  }

  it("creates one query for two identical requests", async () => {
    const key = `key-${Date.now()}`;

    const first = await createQuery(key, "Is the Q4 revenue figure correct?");
    const second = await createQuery(key, "Is the Q4 revenue figure correct?");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(secondBody.data.query_id).toBe(firstBody.data.query_id);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
  });

  it("refuses the same key with a different question", async () => {
    const key = `key-other-${Date.now()}`;

    await createQuery(key, "Is the Q4 revenue figure correct?");
    const conflicting = await createQuery(key, "Is the Q3 revenue figure correct?");

    expect(conflicting.status).toBe(409);
    expect((await conflicting.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("still creates two queries when no key is sent", async () => {
    const first = await createQuery(undefined, "Is the figure correct?");
    const second = await createQuery(undefined, "Is the figure correct?");

    expect((await first.json()).data.query_id).not.toBe((await second.json()).data.query_id);
  });
});
