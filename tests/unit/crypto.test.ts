import { describe, expect, it } from "bun:test";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  generateSessionToken,
  generateVerificationCode,
  generateInvitationToken,
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
});
