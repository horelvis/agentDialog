import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { respondQuery } from "../../src/services/query.service";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { invitations } from "../../src/db/schema/invitations";
import { conversationParticipants } from "../../src/db/schema/participants";
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

  it("finds the prior decision regardless of how the address is capitalised", async () => {
    const { authHeader } = await createTestAgent();
    const mixedCaseEmail = `Mixed-${Date.now()}@Example.com`;

    const first = await create(authHeader, payload({ target_human_email: mixedCaseEmail }));
    expect(first.status).toBe(201);
    const { data } = await first.json();

    const db = getDb();
    await db.update(humanQueries)
      .set({ status: "answered", answer: { kind: "choice", option_ids: ["yes"] } })
      .where(eq(humanQueries.id, data.query_id));

    // Same subject, same person, same casing as before — the delta must still be demanded.
    const second = await create(authHeader, payload({ target_human_email: mixedCaseEmail }));
    expect(second.status).toBe(422);
    expect((await second.json()).error.reason).toBe("prior_decision_without_delta");
  });
});

/**
 * I2. `createQuery` canonicalises the address before it writes it, but the
 * three trust lookups kept searching with whatever casing the agent sent. An
 * agent that wrote `Direccion@Empresa.es` therefore stored a lowercase row and
 * then searched for a capitalised one, found no prior accepted invitation, and
 * that person lost auto-trust permanently.
 */
describe("auto-confianza y mayúsculas", () => {
  it("auto-assigns a trusted human even when the agent capitalises the address", async () => {
    const { authHeader } = await createTestAgent();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const lower = `trust-${stamp}@example.com`;
    const mixed = `Trust-${stamp}@Example.com`;

    // The human has been asked once already and accepted — set up through the
    // normal path, so the invitation row is whatever createQuery writes.
    const first = await create(authHeader, payload({
      subject: { id: `trust-a-${stamp}`, label: "A", body: "x" },
      target_human_email: lower,
    }));
    expect(first.status).toBe(201);

    // Signing in requires an invitation, so this comes after the first query.
    const human = await createTestHuman(lower);
    const db = getDb();
    const [firstRow] = await db.select().from(humanQueries)
      .where(eq(humanQueries.id, (await first.json()).data.query_id));
    await db.update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.conversationId, firstRow.conversationId));
    await db.insert(conversationParticipants).values({
      conversationId: firstRow.conversationId,
      actorType: "human",
      humanId: human.human.id,
      role: "participant",
    }).onConflictDoNothing();

    // Now the same agent asks the same person again, capitalised. Trust must
    // still be found: the query comes back `assigned`, not `pending`.
    const second = await create(authHeader, payload({
      subject: { id: `trust-b-${stamp}`, label: "B", body: "x" },
      target_human_email: mixed,
    }));
    expect(second.status).toBe(201);
    const { data } = await second.json();
    expect(data.status).toBe("assigned");
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

  it("matches the currency unit case-insensitively", async () => {
    const { authHeader } = await createTestAgent();
    const res = await create(authHeader, payload({
      risk: "low",
      target_human_email: `money-lower-${Date.now()}@example.com`,
      answer_space: { kind: "scalar", unit: "eur", max: 50_000, effect: "Ordeno el pago." },
      subject: { id: "pago-2", label: "Pago", uri: "https://drive.example/x" },
    }));
    // "eur" must elevate exactly like "EUR" does.
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("external_referent_at_high_risk");
  });

  it("never lowers a declared risk, even when elevation would only raise it to a lower floor", async () => {
    const { authHeader } = await createTestAgent();
    // A money scalar above the threshold elevates to `high` on its own — but
    // the agent already declared `critical`, which is above that floor.
    // atLeast must keep `critical`; an unconditional overwrite would pull it
    // down to `high` instead.
    const res = await create(authHeader, payload({
      risk: "critical",
      target_human_email: `crit-money-${Date.now()}@example.com`,
      answer_space: { kind: "scalar", unit: "EUR", max: 50_000, effect: "Ordeno el pago." },
      subject: { id: "c-1", label: "C", body: "x", sha256: "a".repeat(64) },
    }));
    expect(res.status).toBe(201);
    const { data } = await res.json();

    const db = getDb();
    const [row] = await db.select().from(humanQueries).where(eq(humanQueries.id, data.query_id));
    expect(row.risk).toBe("critical");
  });
});
