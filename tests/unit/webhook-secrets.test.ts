import { describe, expect, it } from "bun:test";
import { liveSecrets } from "../../src/services/webhook.service";
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
