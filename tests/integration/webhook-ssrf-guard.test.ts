import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers";
import { deliverWebhook } from "../../src/lib/webhook-delivery";

/**
 * The guard decides on its own in tests/unit/webhook-url-guard.test.ts. What is
 * tested here is that it is wired into both places that matter, which is the
 * part a unit test cannot see.
 *
 * Note the cases chosen: NODE_ENV is "test", so private targets are permitted
 * here — the suite's own receiver is a localhost server. A bad scheme and
 * embedded credentials are refused whatever that flag says, so they prove the
 * call happens without needing to fight the environment.
 */
describe("Webhook SSRF guard", () => {
  const app = createTestApp();
  let apiKey: string;
  let hits = 0;
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch: (req) => {
        hits++;
        if (new URL(req.url).pathname === "/redirect") {
          return new Response(null, {
            status: 302,
            headers: { Location: "http://169.254.169.254/latest/meta-data/" },
          });
        }
        return new Response("ok");
      },
    });

    // Registration is rate-limited to 10 per hour across the whole suite, and
    // the counter survives between runs. One agent per file, reused.
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `webhook-ssrf-${Date.now()}`,
        displayName: "Webhook SSRF Test Agent",
      }),
    });
    apiKey = (await res.json()).data.apiKey;
  });

  afterAll(() => server.stop(true));

  async function createWebhook(url: string) {
    return app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, events: ["*"] }),
    });
  }

  it("refuses to register a webhook the guard rejects", async () => {
    const res = await createWebhook("ftp://93.184.216.34/hook");
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("http or https");
  });

  it("refuses to update a webhook onto a rejected URL", async () => {
    const created = await createWebhook(`http://localhost:${server.port}/hook`);
    expect(created.status).toBe(201);
    const { id } = (await created.json()).data;

    const res = await app.request(`/api/v1/agent/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: "http://user:pass@93.184.216.34/hook" }),
    });

    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("credentials");
  });

  it("checks the target before it sends anything", async () => {
    const before = hits;

    const result = await deliverWebhook(`http://user:pass@localhost:${server.port}/hook`, {
      body: "{}",
      event: "test.event",
      msgId: "msg_guard",
      timestamp: Math.floor(Date.now() / 1000),
      signature: "v1,unused",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials");
    expect(hits).toBe(before); // the request was never made
  });

  it("does not follow a redirect out of the checked destination", async () => {
    const result = await deliverWebhook(`http://localhost:${server.port}/redirect`, {
      body: "{}",
      event: "test.event",
      msgId: "msg_redirect",
      timestamp: Math.floor(Date.now() / 1000),
      signature: "v1,unused",
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(302);
    expect(result.error).toContain("redirect");
  });
});
