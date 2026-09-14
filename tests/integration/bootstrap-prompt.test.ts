import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";

/**
 * The bootstrap experience: registering an agent returns a ready-to-paste
 * prompt carrying the just-minted key and a context URL that actually serves
 * the orientation document. The customer copies one thing and starts talking.
 */

const app = createTestApp();

describe("agent bootstrap", () => {
  it("register returns a bootstrapPrompt with the key and the served context URL", async () => {
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `bootstrap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        displayName: "Bootstrap Agent",
      }),
    });
    expect(res.status).toBe(201);

    const { data } = await res.json();
    expect(data.bootstrapPrompt).toBeString();
    expect(data.bootstrapPrompt).toContain(data.apiKey);
    expect(data.bootstrapPrompt).toContain(`/a2a/${data.slug}`);
    expect(data.bootstrapPrompt).toContain("/agent-context.md");
  });

  it("serves the orientation document in markdown", async () => {
    const res = await app.request("/agent-context.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");

    const body = await res.text();
    expect(body).toContain("# Contexto de arranque");
    expect(body).toContain("agente-primero");
  });
});