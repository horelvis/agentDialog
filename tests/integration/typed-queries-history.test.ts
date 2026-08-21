import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";
import { respondQuery } from "../../src/services/query.service";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { eq } from "drizzle-orm";

/**
 * The delta is demanded by the system from its own history, not declared by the
 * agent. An agent cannot dodge it by omitting the fact that there was a prior
 * decision - which is the whole point.
 */

const app = createTestApp();

const spaceWithConsequences = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo hoy." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

function payload(over: Record<string, unknown> = {}) {
  return {
    query_type: "validation",
    risk: "medium",
    subject: { id: "contrato-a", label: "Contrato A", body: "el texto" },
    question: "¿Renovamos?",
    answer_space: spaceWithConsequences,
    timeout_minutes: 60,
    ...over,
  };
}

async function create(authHeader: string, body: Record<string, unknown>) {
  return app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body),
  });
}

describe("decisión previa sobre el mismo asunto", () => {
  it("demands a delta on the second question, and the agent cannot dodge it", async () => {
    const { agent, authHeader } = await createTestAgent();
    const email = `hist-${Date.now()}@example.com`;

    const first = await create(authHeader, payload({ target_human_email: email }));
    expect(first.status).toBe(201);
    const { data } = await first.json();

    // Answer it, so there is a decision to remember.
    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
    await db.update(humanQueries)
      .set({ status: "answered", answer: { kind: "choice", option_ids: ["yes"] } })
      .where(eq(humanQueries.id, row.id));

    // Same subject, same human, same agent, no `changes`.
    const second = await create(authHeader, payload({ target_human_email: email }));
    expect(second.status).toBe(422);
    const body = await second.json();
    expect(body.error.reason).toBe("prior_decision_without_delta");
    expect(body.error.prior_query_id).toBe(row.id);

    // With the delta, it goes through.
    const third = await create(authHeader, payload({
      target_human_email: email,
      changes: [{ path: "Precio", before: "100", after: "120", materiality: "material" }],
    }));
    expect(third.status).toBe(201);
  });

  it("does not count an expired query as a decision", async () => {
    const { authHeader } = await createTestAgent();
    const email = `exp-${Date.now()}@example.com`;

    const first = await create(authHeader, payload({ target_human_email: email }));
    const { data } = await first.json();
    const db = getDb();
    await db.update(humanQueries).set({ status: "expired" }).where(eq(humanQueries.id, data.query_id));

    // Nobody decided anything, so there is no memory to contradict.
    const second = await create(authHeader, payload({ target_human_email: email }));
    expect(second.status).toBe(201);
  });

  it("scopes the subject to the agent", async () => {
    const a = await createTestAgent();
    const b = await createTestAgent();
    const email = `scope-${Date.now()}@example.com`;

    const first = await create(a.authHeader, payload({ target_human_email: email }));
    const { data } = await first.json();
    const db = getDb();
    await db.update(humanQueries)
      .set({ status: "answered", answer: { kind: "choice", option_ids: ["yes"] } })
      .where(eq(humanQueries.id, data.query_id));

    // Agent B's 'contrato-a' is not agent A's.
    const second = await create(b.authHeader, payload({ target_human_email: email }));
    expect(second.status).toBe(201);
  });
});

describe("elevación del riesgo", () => {
  it("raises a low-risk money question to high, and then demands what high demands", async () => {
    const { authHeader } = await createTestAgent();
    const res = await create(authHeader, payload({
      risk: "low",
      target_human_email: `money-${Date.now()}@example.com`,
      answer_space: { kind: "scalar", unit: "EUR", max: 50_000, effect: "Ordeno el pago." },
      subject: { id: "pago-1", label: "Pago", uri: "https://drive.example/x" },
    }));
    // Elevated to high, so a bare external uri is no longer enough.
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("external_referent_at_high_risk");
  });

  it("never lowers a declared risk", async () => {
    const { authHeader } = await createTestAgent();
    const res = await create(authHeader, payload({
      risk: "critical",
      target_human_email: `crit-${Date.now()}@example.com`,
      subject: { id: "c-1", label: "C", body: "x" },   // no sha256
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("missing_referent_hash");
  });
});
