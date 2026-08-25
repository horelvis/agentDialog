import { describe, expect, it } from "bun:test";
import {
  generateGrantToken,
  grantTokenPrefix,
  shouldMintGrant,
} from "../../src/lib/query-grant-token";

/**
 * The prefix is what the database indexes; the rest is compared against a
 * bcrypt hash. Both halves have to come from the same string or a valid token
 * never resolves.
 */

describe("generateGrantToken", () => {
  it("is qgr_ followed by 48 url-safe characters", () => {
    expect(generateGrantToken()).toMatch(/^qgr_[A-Za-z0-9_-]{48}$/);
  });

  it("does not repeat itself", () => {
    expect(generateGrantToken()).not.toBe(generateGrantToken());
  });
});

describe("grantTokenPrefix", () => {
  it("takes the first 15 characters, which is what the index holds", () => {
    const token = generateGrantToken();
    expect(grantTokenPrefix(token)).toBe(token.slice(0, 15));
    expect(grantTokenPrefix(token)).toHaveLength(15);
  });
});

describe("shouldMintGrant", () => {
  it("mints for the risks a one-click link is allowed to resolve", () => {
    expect(shouldMintGrant("low")).toBe(true);
    expect(shouldMintGrant("medium")).toBe(true);
  });

  it("refuses the risks that must still cost a sign-in", () => {
    expect(shouldMintGrant("high")).toBe(false);
    expect(shouldMintGrant("critical")).toBe(false);
  });
});
