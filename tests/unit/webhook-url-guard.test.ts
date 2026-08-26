import { describe, test, expect } from "bun:test";
import { inspectWebhookTarget, privateTargetsAllowed } from "../../src/lib/webhook-url-guard";
import { envSchema, type Env } from "../../src/env";

/**
 * The guard resolves the hostname and judges the addresses, rather than
 * pattern-matching the text. That is what makes the decimal and octal spellings
 * of 127.0.0.1 fall out for free instead of needing a rule each.
 */
describe("inspectWebhookTarget", () => {
  const blocked: Array<[string, string]> = [
    ["the cloud metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["loopback by name", "http://localhost:3000/hook"],
    ["loopback by address", "http://127.0.0.1/hook"],
    ["loopback spelled as a decimal integer", "http://2130706433/hook"],
    ["loopback spelled in octal", "http://0177.0.0.1/hook"],
    ["the private 10/8 range", "http://10.0.0.5/hook"],
    ["the private 172.16/12 range", "http://172.16.0.1/hook"],
    ["the private 192.168/16 range", "http://192.168.1.1/hook"],
    ["the carrier-grade NAT range", "http://100.64.0.1/hook"],
    ["the unspecified address", "http://0.0.0.0/hook"],
    ["IPv6 loopback", "http://[::1]/hook"],
    ["an IPv6 unique local address", "http://[fd00::1]/hook"],
    ["an IPv6 link-local address", "http://[fe80::1]/hook"],
    ["metadata mapped into IPv6", "http://[::ffff:169.254.169.254]/hook"],
  ];

  for (const [label, url] of blocked) {
    test(`refuses ${label}`, async () => {
      const verdict = await inspectWebhookTarget(url, false);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBeTruthy();
    });
  }

  test("refuses a scheme that is not http or https", async () => {
    for (const url of ["ftp://93.184.216.34/hook", "file:///etc/passwd"]) {
      const verdict = await inspectWebhookTarget(url, false);
      expect(verdict.allowed).toBe(false);
    }
  });

  test("refuses credentials embedded in the URL", async () => {
    const verdict = await inspectWebhookTarget("http://user:pass@93.184.216.34/hook", false);
    expect(verdict.allowed).toBe(false);
  });

  test("refuses a URL it cannot parse", async () => {
    const verdict = await inspectWebhookTarget("not a url", false);
    expect(verdict.allowed).toBe(false);
  });

  test("allows a public address", async () => {
    const verdict = await inspectWebhookTarget("https://93.184.216.34/hook", false);
    expect(verdict.allowed).toBe(true);
  });

  test("allows a public address on a non-standard port", async () => {
    const verdict = await inspectWebhookTarget("http://93.184.216.34:8080/hook", false);
    expect(verdict.allowed).toBe(true);
  });

  /**
   * The escape hatch development and the test suite run with: the suite's own
   * receiver is a localhost server. env.ts refuses this in production.
   */
  test("allows a private address when private targets are permitted", async () => {
    const verdict = await inspectWebhookTarget("http://127.0.0.1:9999/hook", true);
    expect(verdict.allowed).toBe(true);
  });

  test("still refuses a bad scheme when private targets are permitted", async () => {
    const verdict = await inspectWebhookTarget("file:///etc/passwd", true);
    expect(verdict.allowed).toBe(false);
  });
});

/**
 * The escape hatch defaults to on outside production so the suite and `bun run
 * dev` keep working without anyone discovering a new variable, and production
 * refuses to boot with it on — a private target there is the vulnerability.
 */
describe("WEBHOOK_ALLOW_PRIVATE_TARGETS", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    SESSION_SECRET: "s".repeat(32),
    INBOUND_EMAIL_WEBHOOK_SECRET: "a-secret",
    WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  };

  test("defaults to off in production and on elsewhere", () => {
    expect(privateTargetsAllowed({ NODE_ENV: "production" } as Env)).toBe(false);
    expect(privateTargetsAllowed({ NODE_ENV: "development" } as Env)).toBe(true);
    expect(privateTargetsAllowed({ NODE_ENV: "test" } as Env)).toBe(true);
  });

  test("an explicit value wins outside production", () => {
    expect(
      privateTargetsAllowed({
        NODE_ENV: "development",
        WEBHOOK_ALLOW_PRIVATE_TARGETS: false,
      } as Env),
    ).toBe(false);
  });

  test("production refuses to start with private targets enabled", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      WEBHOOK_ALLOW_PRIVATE_TARGETS: "true",
    });
    expect(result.success).toBe(false);
  });

  test("production starts with private targets disabled", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      WEBHOOK_ALLOW_PRIVATE_TARGETS: "false",
    });
    expect(result.success).toBe(true);
  });
});
