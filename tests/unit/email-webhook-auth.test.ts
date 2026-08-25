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
  WEBHOOK_ENCRYPTION_KEY: "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktdA==",
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
