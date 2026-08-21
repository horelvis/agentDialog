import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

const app = createTestApp();

async function post(body: unknown) {
  const { authHeader } = await createTestAgent();
  return app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body),
  });
}

const base = {
  query_type: "validation",
  risk: "low",
  subject: { id: "asunto-1", label: "Un asunto", body: "el referente" },
  question: "¿Seguimos?",
  answer_space: {
    kind: "choice", select: "one",
    options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }],
  },
  target_human_email: "quien@example.com",
  timeout_minutes: 60,
};

describe("POST /agent/queries con espacio de respuesta", () => {
  it("creates a query that carries a referent and a closed answer space", async () => {
    const res = await post({ ...base, target_human_email: `a-${Date.now()}@example.com` });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.query_id).toBeString();
  });

  it("refuses a subject with no referent, with a remedy an agent can act on", async () => {
    const res = await post({ ...base, subject: { id: "a", label: "A" },
                             target_human_email: `b-${Date.now()}@example.com` });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("UNDECIDABLE_QUERY");
    expect(body.error.reason).toBe("missing_referent");
    expect(body.error.remedy).toBeString();
    expect(body.error.remedy.length).toBeGreaterThan(0);
  });

  it("refuses a free-text answer space above low risk", async () => {
    const res = await post({
      ...base, risk: "high",
      // sha256 of the literal string "x" — the brief's placeholder "abc" fails
      // subjectSchema's format check before the request ever reaches admission,
      // which defeats the point of this test (it should exercise
      // text_answer_above_low_risk, not a malformed-hash rejection).
      subject: { id: "a", label: "A", body: "x", sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881" },
      answer_space: { kind: "text", max_length: 500 },
      target_human_email: `c-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.reason).toBe("text_answer_above_low_risk");
  });

  it("refuses a shape outside the catalogue", async () => {
    const res = await post({
      ...base,
      answer_space: { kind: "json_schema", schema: { type: "object" } },
      target_human_email: `d-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(422);
  });

  it("refuses a query with no answer_space at all", async () => {
    const { answer_space, ...withoutSpace } = base;
    const res = await post({ ...withoutSpace, target_human_email: `e-${Date.now()}@example.com` });
    expect(res.status).toBe(422);
  });

  // The escape hatch, and it is explicit on purpose.
  it("admits a self-contained question with no referent", async () => {
    const res = await post({
      ...base, self_contained: true, subject: { id: "viernes", label: "Despliegue del viernes" },
      question: "¿Desplegamos un viernes?",
      target_human_email: `f-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(201);
  });

  it("does not create anything when admission refuses", async () => {
    const { authHeader } = await createTestAgent();
    const before = await app.request("/api/v1/agent/queries?limit=100", { headers: { Authorization: authHeader } });
    const countBefore = (await before.json()).data.length;

    await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ ...base, subject: { id: "a", label: "A" },
                             target_human_email: `g-${Date.now()}@example.com` }),
    });

    const after = await app.request("/api/v1/agent/queries?limit=100", { headers: { Authorization: authHeader } });
    expect((await after.json()).data.length).toBe(countBefore);
  });
});
