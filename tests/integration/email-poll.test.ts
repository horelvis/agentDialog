import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";

/**
 * Cloud Scheduler cannot sign like a mail provider, so a shared secret in a
 * header is what authenticates this endpoint. It runs the ingest, which records
 * humans' answers, so it must never be callable without one.
 *
 * tests/setup.ts sets INTERNAL_POLL_SECRET and deliberately leaves the IMAP
 * variables unset, which is also the "not configured" case worth asserting.
 */

const SECRET = "test-internal-poll-secret";

describe("POST /api/v1/internal/email/poll", () => {
  const app = createTestApp();

  it("rejects a request with no secret", async () => {
    const res = await app.request("/api/v1/internal/email/poll", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      method: "POST",
      headers: { "x-internal-secret": "not-the-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a secret that is a prefix of the real one", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      method: "POST",
      headers: { "x-internal-secret": SECRET.slice(0, -1) },
    });
    expect(res.status).toBe(401);
  });

  // Criterion 6: with no mailbox configured, the endpoint says so and nothing
  // else in the system behaves differently.
  it("answers 503 when the mailbox is not configured", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      method: "POST",
      headers: { "x-internal-secret": SECRET },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("MAILBOX_NOT_CONFIGURED");
  });

  it("is not reachable with GET", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      headers: { "x-internal-secret": SECRET },
    });
    expect(res.status).toBe(404);
  });
});
