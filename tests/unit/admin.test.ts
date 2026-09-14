import { describe, expect, test } from "bun:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * init-env writes .env from .env.onprem.example. The interesting part to
 * verify without a database is that the output validates against envSchema —
 * the app refuses to start with a broken .env, so a template that cannot
 * produce a valid one would ship a dead deployment. stdin is ignored so the
 * prompts resolve to their defaults.
 */

async function runAdmin(args: string[], cwd: string) {
  const proc = Bun.spawn(["bun", "run", join(process.cwd(), "scripts/admin.ts"), ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "" },
    stdin: "ignore",
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

describe("admin init-env", () => {
  test("writes a .env that validates, from a fresh template", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-onprem-"));
    try {
      await copyFile(join(process.cwd(), ".env.onprem.example"), join(dir, ".env.onprem.example"));
      const { stdout, exitCode } = await runAdmin(["init-env"], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("passes environment validation");

      const written = await readFile(join(dir, ".env"), "utf8");
      expect(written).toContain("DEPLOYMENT_MODE=onprem");
      expect(written).toContain("SESSION_SECRET=");
      expect(written).toContain("WEBHOOK_ENCRYPTION_KEY=");
      expect(written).toContain("INBOUND_EMAIL_WEBHOOK_SECRET=");
      // The compose file interpolates POSTGRES_PASSWORD; DATABASE_URL must
      // carry the same password or the first `docker compose up` fails auth.
      const password = written.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1];
      expect(password).toBeTruthy();
      expect(written).toContain(`postgresql://agentdialog:${password}@postgres:5432/agentdialog`);
      // No live value may still carry the placeholder; comments may mention it
      // as documentation.
      for (const line of written.split("\n")) {
        if (/^[A-Z0-9_]+=/.test(line)) expect(line).not.toContain("<generated-by-admin-init-env>");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite an existing .env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-onprem-"));
    try {
      await copyFile(join(process.cwd(), ".env.onprem.example"), join(dir, ".env.onprem.example"));
      await Bun.write(join(dir, ".env"), "ALREADY=here\n");
      const { stderr, exitCode } = await runAdmin(["init-env"], dir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("already exists");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});