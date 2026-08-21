import { describe, expect, it } from "bun:test";

/**
 * The migration script must not validate the API's environment schema.
 *
 * It used to call loadEnv(), which parses every production requirement and
 * exits on the first failure. That coupled schema changes to variables no
 * migration reads: the v0.8.0 deploy pushed its image, then aborted here
 * because INBOUND_EMAIL_WEBHOOK_SECRET was unset — a secret used only by a
 * dormant webhook. Production kept the old code while the release stalled
 * mid-pipeline.
 *
 * These tests run the real script as a subprocess. The connection is expected
 * to fail; what matters is how far it gets first.
 */

// Port 1 refuses immediately, so the script fails at connect rather than hanging.
const UNREACHABLE = "postgresql://u:p@127.0.0.1:1/db?connect_timeout=1";

// Bun loads .env from the working directory on its own, so an omitted variable
// is not an absent one — omitting DATABASE_URL here silently picks up the
// developer's local database and migrates it. Every case below sets the
// variable explicitly; an explicit empty value is what "unset" has to mean.

async function runMigrate(env: Record<string, string | undefined>) {
  const proc = Bun.spawn(["bun", "run", "scripts/migrate.ts"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("scripts/migrate.ts environment handling", () => {
  it("runs without the API's production-only variables", async () => {
    const { stdout, stderr } = await runMigrate({
      NODE_ENV: "production",
      DATABASE_URL: UNREACHABLE,
      // INBOUND_EMAIL_WEBHOOK_SECRET and SESSION_SECRET deliberately absent:
      // loadEnv() would reject both in production.
    });

    expect(stderr).not.toContain("Invalid environment variables");
    expect(stderr).not.toContain("INBOUND_EMAIL_WEBHOOK_SECRET");
    // Proves it got past validation and into the migration itself.
    expect(stdout).toContain("[MIGRATE] Running migrations...");
  }, 30000);

  it("refuses without DATABASE_URL, naming the variable", async () => {
    const { stdout, stderr, exitCode } = await runMigrate({
      NODE_ENV: "production",
      DATABASE_URL: "",
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("DATABASE_URL is required");
    expect(stdout).not.toContain("[MIGRATE] Running migrations...");
  }, 30000);
});
