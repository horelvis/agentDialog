import { describe, expect, it, beforeAll } from "bun:test";
import { createTestApp } from "../helpers";
import { agentRegisterResponse, agentKeyRotateResponse } from "../../src/validators/agent.responses";

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
    const body = await res.clone().json();
    expect(() => agentRegisterResponse.parse(body)).not.toThrow();
    expect(body.data.apiKey).toStartWith("mge_ag_");
    expect(body.data.slug).toContain("test-agent-");
    expect(body.data.displayName).toBe("Integration Test Agent");
    expect(body.data.capabilities).toEqual(["chat", "tool-use"]);
  });

  it("rotates the key it just registered", async () => {
    // POST /key/rotate's schema is otherwise never checked against a real
    // response. Registers its own agent (this file already does, per case)
    // rather than reusing another file's, since registration is rate-limited
    // and the counter is shared across the whole suite.
    const regRes = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `rotate-test-${Date.now()}`,
        displayName: "Rotate Test Agent",
      }),
    });
    expect(regRes.status).toBe(201);
    const { data: agentData } = await regRes.json();

    const rotateRes = await app.request("/api/v1/agent/key/rotate", {
      method: "POST",
      headers: { Authorization: `Bearer ${agentData.apiKey}` },
    });
    expect(rotateRes.status).toBe(200);
    const rotateBody = await rotateRes.clone().json();
    expect(() => agentKeyRotateResponse.parse(rotateBody)).not.toThrow();
    expect(rotateBody.data.apiKey).toStartWith("mge_ag_");
    expect(rotateBody.data.apiKey).not.toBe(agentData.apiKey);
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
