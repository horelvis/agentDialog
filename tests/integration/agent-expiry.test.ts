import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { agents } from "../../src/db/schema/agents";
import { deactivateExpiredAgents } from "../../src/services/agent.service";
import { registerAgent } from "../../src/services/agent.service";

/**
 * Ephemeral agents. There is no delete endpoint, so an agent that wants to
 * leave self-declares a lifetime at registration. The expiry is enforced two
 * ways: lazily at authentication (the moment it passes) and by the periodic
 * sweep (which flips the status to deactivated).
 */

const app = createTestApp();

describe("agent expiry", () => {
  it("sets expiresAt when the agent declares a lifetime, and null otherwise", async () => {
    const withTtl = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `ttl-${Date.now()}`,
        displayName: "TTL Agent",
        expiresInMinutes: 60,
      }),
    });
    expect(withTtl.status).toBe(201);
    const { data: withTtlData } = await withTtl.json();
    expect(withTtlData.expiresAt).toBeString();
    const expiresInMs = new Date(withTtlData.expiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(50 * 60_000);
    expect(expiresInMs).toBeLessThan(61 * 60_000);

    const withoutTtl = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `no-ttl-${Date.now()}`,
        displayName: "Permanent Agent",
      }),
    });
    const { data: withoutTtlData } = await withoutTtl.json();
    expect(withoutTtlData.expiresAt).toBeNull();
  });

  it("refuses an authenticated request the moment the lifetime passes", async () => {
    const { agent, apiKey } = await registerAgent({
      slug: `expired-${Date.now()}`,
      displayName: "Expired Agent",
    });
    const authHeader = `Bearer ${apiKey}`;

    const before = await app.request("/api/v1/agent/me", { headers: { Authorization: authHeader } });
    expect(before.status).toBe(200);

    // Move the expiry into the past directly: the lazy check must refuse now,
    // before any sweep runs.
    const db = getDb();
    await db
      .update(agents)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(agents.id, agent.id));

    const after = await app.request("/api/v1/agent/me", { headers: { Authorization: authHeader } });
    expect(after.status).toBe(401);
    expect((await after.json()).error.message).toContain("expired");
  });

  it("deactivates expired agents in the sweep, and leaves permanent ones alone", async () => {
    const { agent: expired } = await registerAgent({
      slug: `sweep-expired-${Date.now()}`,
      displayName: "Sweep Expired",
    });
    const { agent: permanent } = await registerAgent({
      slug: `sweep-kept-${Date.now()}`,
      displayName: "Sweep Kept",
    });

    const db = getDb();
    await db
      .update(agents)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(agents.id, expired.id));

    const deactivated = await deactivateExpiredAgents();

    const [expiredRow] = await db.select().from(agents).where(eq(agents.id, expired.id));
    const [permanentRow] = await db.select().from(agents).where(eq(agents.id, permanent.id));

    expect(deactivated).toBeGreaterThanOrEqual(1);
    expect(expiredRow.status).toBe("deactivated");
    expect(permanentRow.status).toBe("active");
    expect(permanentRow.expiresAt).toBeNull();
  });
});