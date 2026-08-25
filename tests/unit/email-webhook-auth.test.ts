import { describe, expect, it } from "bun:test";
import { signatureRequirement } from "../../src/lib/email-webhook-verify";
import { envSchema } from "../../src/env";

/**
 * The inbound email webhook accepts a human's answer to an agent's question,
 * creates the human if needed, auto-accepts their invitation and records the
 * answer. An unauthenticated request to it can forge an approval.
 *
 * It used to verify the signature only `if (secret)`, which fails OPEN: with no
 * secret configured — the state production was actually in — every request was
 * accepted.
 */

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  SESSION_SECRET: "a-session-secret-of-at-least-32-chars",
  WEBHOOK_ENCRYPTION_KEY: "dGVzdC13ZWJob29rLWtleS0zMi1ieXRlcy1sb25nISE=",
};

describe("signatureRequirement", () => {
  it("verifies when a secret is configured", () => {
    expect(signatureRequirement("production", "whsec_abc")).toBe("verify");
    expect(signatureRequirement("development", "whsec_abc")).toBe("verify");
  });

  it("refuses in production when no secret is configured", () => {
    expect(signatureRequirement("production", undefined)).toBe("refuse");
    expect(signatureRequirement("production", "")).toBe("refuse");
  });

  it("skips outside production so local development still works", () => {
    expect(signatureRequirement("development", undefined)).toBe("skip");
    expect(signatureRequirement("test", undefined)).toBe("skip");
  });
});

describe("env schema", () => {
  it("rejects a production environment with no inbound webhook secret", () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: "production" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("INBOUND_EMAIL_WEBHOOK_SECRET");
    }
  });

  it("accepts production once the secret is present", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      INBOUND_EMAIL_WEBHOOK_SECRET: "whsec_abc",
    });
    expect(result.success).toBe(true);
  });

  it("does not require the secret outside production", () => {
    expect(envSchema.safeParse({ ...base, NODE_ENV: "development" }).success).toBe(true);
    expect(envSchema.safeParse({ ...base, NODE_ENV: "test" }).success).toBe(true);
  });
});

describe("env schema: WEBHOOK_ENCRYPTION_KEY", () => {
  // secret-box.ts's own guard only fires at the first seal/open, which lets a
  // malformed key boot green and fail silently on the first webhook dispatch.
  // This checks the same 32-byte requirement at startup instead, in every
  // environment — not just production — since a broken key is broken anywhere.

  it("rejects a key that is not 32 bytes once base64-decoded", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "development",
      // Decodes to 28 bytes, not 32.
      WEBHOOK_ENCRYPTION_KEY: "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktdA==",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("WEBHOOK_ENCRYPTION_KEY");
      expect(JSON.stringify(result.error.issues)).toContain("32 bytes");
    }
  });

  it("accepts a key that decodes to exactly 32 bytes", () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: "development" });
    expect(result.success).toBe(true);
  });

  it("does not require the key to be set at all outside production", () => {
    const { WEBHOOK_ENCRYPTION_KEY, ...rest } = base;
    expect(envSchema.safeParse({ ...rest, NODE_ENV: "development" }).success).toBe(true);
  });
});
