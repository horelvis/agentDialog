import { describe, expect, it, beforeAll } from "bun:test";
import { createTestApp } from "../helpers";

describe("Declared language", () => {
  const app = createTestApp();
  let apiKey: string;

  beforeAll(async () => {
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: `lang-${Date.now()}`, displayName: "Language Test Agent" }),
    });
    apiKey = (await res.json()).data.apiKey;
  });

  function createQuery(language?: string) {
    const body: Record<string, unknown> = {
      query_type: "validation",
      risk: "low",
      subject: { id: "s1", label: "A figure", body: "Revenue: 2,300,000 EUR." },
      answer_space: { kind: "boolean", labels: { t: "Yes", f: "No" } },
      question: "Is this right?",
      target_human_email: "lang@example.com",
      timeout_minutes: 30,
    };
    if (language !== undefined) body.language = language;

    return app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  }

  it("stores and returns a declared language", async () => {
    const created = await createQuery("ca");
    expect(created.status).toBe(201);

    const { data } = await created.json();
    const read = await app.request(`/api/v1/agent/queries/${data.query_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect((await read.json()).data.language).toBe("ca");
  });

  it("defaults to English when the agent declares nothing", async () => {
    const created = await createQuery();
    const { data } = await created.json();

    const read = await app.request(`/api/v1/agent/queries/${data.query_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect((await read.json()).data.language).toBe("en");
  });

  it("refuses a language outside the catalogue", async () => {
    // The catalogue belongs to the product. An unsupported value is a 422 the
    // agent can act on, not a silent English email.
    const res = await createQuery("eu");
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("language");
  });
});
