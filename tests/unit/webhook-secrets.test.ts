import { describe, expect, it } from "bun:test";
import { liveSecrets, refusesReactivation, retireCurrentSecret } from "../../src/services/webhook.service";
import type { StoredSecret } from "../../src/db/schema/webhooks";

/**
 * Which secrets sign a delivery. A rotated secret keeps signing until its
 * grace window closes, and then must stop — a secret that outlives its
 * expiry is a secret nobody can revoke.
 */

function secret(id: string, expiresAt: string | null): StoredSecret {
  return { id, ciphertext: "x", iv: "y", tag: "z", createdAt: "2026-08-25T00:00:00.000Z", expiresAt };
}

const NOW = new Date("2026-08-25T12:00:00.000Z");

describe("liveSecrets", () => {
  it("keeps a secret that never expires", () => {
    expect(liveSecrets([secret("a", null)], NOW).map((s) => s.id)).toEqual(["a"]);
  });

  it("keeps a rotated secret while its grace window is open", () => {
    const secrets = [secret("new", null), secret("old", "2026-08-25T18:00:00.000Z")];
    expect(liveSecrets(secrets, NOW).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("drops a secret whose window has closed", () => {
    const secrets = [secret("new", null), secret("old", "2026-08-25T06:00:00.000Z")];
    expect(liveSecrets(secrets, NOW).map((s) => s.id)).toEqual(["new"]);
  });

  it("returns nothing when every secret has expired", () => {
    expect(liveSecrets([secret("old", "2026-08-24T00:00:00.000Z")], NOW)).toEqual([]);
  });
});

/**
 * What a rotation keeps. The spec says the previous secret — singular —
 * stays alive through a grace window; a secret already counting down from an
 * earlier rotation must not be carried forward, or repeated rotations pile
 * up an unbounded number of live secrets.
 */
describe("retireCurrentSecret", () => {
  const GRACE = "2026-08-26T12:00:00.000Z";

  it("gives the current, non-expiring secret the grace window", () => {
    const result = retireCurrentSecret([secret("current", null)], GRACE);
    expect(result).toEqual([{ ...secret("current", null), expiresAt: GRACE }]);
  });

  it("drops a secret that is already counting down from an earlier rotation", () => {
    const secrets = [secret("current", null), secret("already-retiring", "2026-08-25T18:00:00.000Z")];
    expect(retireCurrentSecret(secrets, GRACE).map((s) => s.id)).toEqual(["current"]);
  });

  it("produces nothing to retire when there is no current secret", () => {
    expect(retireCurrentSecret([secret("already-retiring", "2026-08-25T18:00:00.000Z")], GRACE)).toEqual([]);
  });
});

/**
 * `rotate-secret` must be the only route back for a webhook with no live
 * secret. Letting `PATCH { isActive: true }` through on an empty-secrets row
 * reactivates a webhook that dispatch will then skip forever, silently.
 */
describe("refusesReactivation", () => {
  it("refuses to activate a webhook with no live secret", () => {
    expect(refusesReactivation([], true, NOW)).toBe(true);
  });

  it("refuses when every secret has expired", () => {
    expect(refusesReactivation([secret("old", "2026-08-24T00:00:00.000Z")], true, NOW)).toBe(true);
  });

  it("allows activation when a secret is still live", () => {
    expect(refusesReactivation([secret("a", null)], true, NOW)).toBe(false);
  });

  it("does not apply when isActive is not being set to true", () => {
    expect(refusesReactivation([], false, NOW)).toBe(false);
    expect(refusesReactivation([], undefined, NOW)).toBe(false);
  });
});
