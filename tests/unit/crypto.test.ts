import { describe, expect, it } from "bun:test";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  generateSessionToken,
  generateVerificationCode,
  generateInvitationToken,
  generateWebhookSecret,
  signWebhookPayload,
} from "../../src/lib/crypto";

describe("crypto", () => {
  it("generates API keys with correct prefix", () => {
    const { key, prefix } = generateApiKey();
    expect(key).toStartWith("mge_ag_");
    expect(prefix).toHaveLength(15); // "mge_ag_" (7) + 8 chars
    expect(key.startsWith(prefix)).toBe(true);
  });

  it("hashes and verifies API keys", async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);
    expect(await verifyApiKey(key, hash)).toBe(true);
    expect(await verifyApiKey("wrong-key", hash)).toBe(false);
  });

  it("generates session tokens with correct prefix", () => {
    const token = generateSessionToken();
    expect(token).toStartWith("sess_");
  });

  it("generates 6-digit verification codes", () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code.length).toBe(6);
  });

  it("generates invitation tokens", () => {
    const token = generateInvitationToken();
    expect(token.length).toBe(32);
  });

  it("generates webhook secrets", () => {
    const secret = generateWebhookSecret();
    expect(secret.length).toBe(64); // 32 bytes hex
  });

  it("signs webhook payloads consistently", () => {
    const payload = '{"test": true}';
    const secret = "test-secret";
    const sig1 = signWebhookPayload(payload, secret);
    const sig2 = signWebhookPayload(payload, secret);
    expect(sig1).toBe(sig2);

    // Different payload = different signature
    const sig3 = signWebhookPayload('{"test": false}', secret);
    expect(sig1).not.toBe(sig3);
  });
});
