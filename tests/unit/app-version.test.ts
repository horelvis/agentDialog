import { describe, expect, it } from "bun:test";
import { appVersion } from "../../src/lib/app-version";

/**
 * The root endpoint reported "0.1.0" while the service ran v0.8.6 — a constant
 * nobody remembered to change, in a place nobody looked. The deploy already
 * knows the true version: it builds the image from the release tag. This makes
 * that tag the only source, so the two cannot drift again.
 */

describe("appVersion", () => {
  it("reports what the build was stamped with", () => {
    expect(appVersion({ APP_VERSION: "v0.8.7" })).toBe("v0.8.7");
  });

  it("says dev when nothing stamped it, rather than inventing a number", () => {
    expect(appVersion({})).toBe("dev");
    expect(appVersion({ APP_VERSION: "" })).toBe("dev");
    expect(appVersion({ APP_VERSION: "   " })).toBe("dev");
  });

  it("is never a hard-coded release number", () => {
    // The regression this file exists to prevent: someone replacing the stamp
    // with today's version, which is right for exactly one release.
    expect(appVersion({})).not.toMatch(/^v?\d+\.\d+\.\d+$/);
  });
});
