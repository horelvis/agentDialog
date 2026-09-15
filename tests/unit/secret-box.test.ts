import { describe, expect, it } from "bun:test";
import { seal, open, type SealedSecret } from "../../src/lib/secret-box";

/**
 * The signing secret has to come back out — that is the whole point, and the
 * reason bcrypt was the wrong tool. What must not come back out is anything
 * an attacker tampered with.
 */

describe("seal / open", () => {
  it("returns an actionable 503 when webhook encryption is not configured", async () => {
    // A subprocess gives loadEnv a fresh cache without mutating the test
    // suite's shared environment or its encryption key.
    const script = `
      import { Hono } from "hono";
      import { seal } from "./src/lib/secret-box";
      import { errorHandler } from "./src/middleware/error-handler";
      const app = new Hono();
      app.onError(errorHandler);
      app.post("/seal", (c) => c.json(seal("test-signing-secret")));
      const response = await app.request("/seal", { method: "POST" });
      console.log(JSON.stringify({ status: response.status, body: await response.json() }));
    `;
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development", WEBHOOK_ENCRYPTION_KEY: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("WEBHOOK_ENCRYPTION_NOT_CONFIGURED");
    expect(result.body.error.message).toContain("GCP Secret Manager");
    expect(stdout).not.toContain("test-signing-secret");
  });

  it("returns the original secret", () => {
    const secret = "whsec_K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN";
    expect(open(seal(secret))).toBe(secret);
  });

  it("uses a fresh iv every time, so the same secret never seals alike", () => {
    const a = seal("whsec_same");
    const b = seal("whsec_same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a tampered ciphertext", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, ciphertext: flipFirstByte(sealed.ciphertext) };
    expect(() => open(tampered)).toThrow();
  });

  it("refuses a tampered authentication tag", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, tag: flipFirstByte(sealed.tag) };
    expect(() => open(tampered)).toThrow();
  });

  it("refuses a tampered iv", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, iv: flipFirstByte(sealed.iv) };
    expect(() => open(tampered)).toThrow();
  });
});

function flipFirstByte(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  buf[0] = buf[0] ^ 0xff;
  return buf.toString("base64");
}
