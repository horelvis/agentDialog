import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createHmac } from "crypto";
import { createTestApp } from "../helpers";
import { dispatchWebhooks } from "../../src/services/webhook.service";

/**
 * The test the codebase did not have, and the reason a signature keyed with a
 * bcrypt hash shipped: nothing ever verified a delivery the way a consumer
 * does. This captures a real request and verifies it from the specification.
 */

interface Captured {
  headers: Record<string, string>;
  body: string;
}

describe("Webhook signature", () => {
  const app = createTestApp();
  const captured: Captured[] = [];
  let server: ReturnType<typeof Bun.serve>;
  let receiverUrl: string;
  let apiKey: string;
  let agentId: string;

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        captured.push({
          headers: Object.fromEntries(req.headers.entries()),
          body: await req.text(),
        });
        return new Response("ok");
      },
    });
    receiverUrl = `http://localhost:${server.port}/hook`;

    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `webhook-sig-${Date.now()}`,
        displayName: "Webhook Signature Test Agent",
      }),
    });
    const body = await res.json();
    apiKey = body.data.apiKey;
    agentId = body.data.id;
  });

  afterAll(() => server.stop(true));

  function verify(entry: Captured, secret: string): boolean {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signed = `${entry.headers["webhook-id"]}.${entry.headers["webhook-timestamp"]}.${entry.body}`;
    const expected = createHmac("sha256", key).update(signed).digest("base64");

    return entry.headers["webhook-signature"]
      .split(" ")
      .some((s) => s === `v1,${expected}`);
  }

  it("delivers a signature the creation secret can verify", async () => {
    const created = await app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: receiverUrl, events: ["*"] }),
    });
    const { data } = await created.json();
    expect(data.secret).toStartWith("whsec_");

    captured.length = 0;
    await dispatchWebhooks(agentId, "query.answered", { queryId: "test" });
    await Bun.sleep(500);

    expect(captured).toHaveLength(1);
    expect(verify(captured[0], data.secret)).toBe(true);
  });

  it("signs with both secrets during the rotation window", async () => {
    const created = await app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: receiverUrl, events: ["*"] }),
    });
    const first = await created.json();

    const rotated = await app.request(
      `/api/v1/agent/webhooks/${first.data.id}/rotate-secret`,
      { method: "POST", headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const second = await rotated.json();
    expect(second.data.secret).not.toBe(first.data.secret);

    captured.length = 0;
    await dispatchWebhooks(agentId, "query.answered", { queryId: "test" });
    await Bun.sleep(500);

    const forThisHook = captured.find((c) => c.headers["webhook-signature"].includes(" "));
    expect(forThisHook).toBeDefined();
    expect(verify(forThisHook!, first.data.secret)).toBe(true);
    expect(verify(forThisHook!, second.data.secret)).toBe(true);
  });

  it("never returns secret material from list, update or delete", async () => {
    const created = await app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: receiverUrl, events: ["*"] }),
    });
    const { data } = await created.json();

    const listed = await (
      await app.request("/api/v1/agent/webhooks", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    ).text();

    const updated = await (
      await app.request(`/api/v1/agent/webhooks/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ events: ["query.answered"] }),
      })
    ).text();

    const removed = await (
      await app.request(`/api/v1/agent/webhooks/${data.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    ).text();

    for (const payload of [listed, updated, removed]) {
      expect(payload).not.toContain("whsec_");
      expect(payload).not.toContain("secrets");
      expect(payload).not.toContain("ciphertext");
      expect(payload).not.toContain("secretHash");
    }
  });
});
