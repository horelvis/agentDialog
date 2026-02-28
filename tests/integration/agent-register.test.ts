import { describe, expect, it, beforeAll } from "bun:test";
import { createTestApp } from "../helpers";

describe("Agent Registration", () => {
  const app = createTestApp();

  it("registers a new agent", async () => {
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `test-agent-${Date.now()}`,
        displayName: "Integration Test Agent",
        description: "An agent for testing",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        capabilities: ["chat", "tool-use"],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.apiKey).toStartWith("mge_ag_");
    expect(body.data.slug).toContain("test-agent-");
    expect(body.data.displayName).toBe("Integration Test Agent");
    expect(body.data.capabilities).toEqual(["chat", "tool-use"]);
  });

  it("rejects duplicate slugs", async () => {
    const slug = `dup-test-${Date.now()}`;

    await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, displayName: "First Agent" }),
    });

    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, displayName: "Second Agent" }),
    });

    expect(res.status).toBe(409);
  });

  it("rejects invalid registration data", async () => {
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "AB", displayName: "" }),
    });

    expect(res.status).toBe(422);
  });
});
