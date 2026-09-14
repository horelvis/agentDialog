import { describe, expect, test } from "bun:test";
import { envSchema } from "../../src/env";

/**
 * DEPLOYMENT_MODE splits the production ruleset into cloud and on-premise.
 * Cloud keeps every guard it had. On-premise permits webhooks into the private
 * network, but hard-requires a real SMTP relay and an https APP_URL — an
 * on-premise deployment with neither is one nobody can sign in to.
 */

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SESSION_SECRET: "s".repeat(32),
  INBOUND_EMAIL_WEBHOOK_SECRET: "a-secret",
  WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  APP_URL: "https://agentdialog.corp.example",
  SMTP_HOST: "smtp.corp.example",
};

describe("DEPLOYMENT_MODE", () => {
  test("defaults to cloud", () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: "production" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.DEPLOYMENT_MODE).toBe("cloud");
  });
});

describe("WEBHOOK_ALLOW_PRIVATE_TARGETS by mode", () => {
  test("cloud production refuses private targets enabled", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "cloud",
      WEBHOOK_ALLOW_PRIVATE_TARGETS: "true",
    });
    expect(result.success).toBe(false);
  });

  test("onprem production permits private targets enabled", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "onprem",
      WEBHOOK_ALLOW_PRIVATE_TARGETS: "true",
    });
    expect(result.success).toBe(true);
  });

  test("onprem production keeps the safe default when unset", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "onprem",
    });
    expect(result.success).toBe(true);
  });
});

describe("SMTP_HOST in onprem production", () => {
  for (const host of ["localhost", "127.0.0.1", "::1"]) {
    test(`refuses ${host}`, () => {
      const result = envSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        DEPLOYMENT_MODE: "onprem",
        SMTP_HOST: host,
      });
      expect(result.success).toBe(false);
    });
  }

  test("accepts a real relay", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "onprem",
      SMTP_HOST: "smtp.corp.example",
    });
    expect(result.success).toBe(true);
  });

  test("cloud production is not forced to a relay", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "cloud",
      SMTP_HOST: "localhost",
    });
    expect(result.success).toBe(true);
  });
});

describe("APP_URL in onprem production", () => {
  test("refuses plain http", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "onprem",
      APP_URL: "http://agentdialog.corp.example",
    });
    expect(result.success).toBe(false);
  });

  test("accepts https", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "onprem",
      APP_URL: "https://agentdialog.corp.example",
    });
    expect(result.success).toBe(true);
  });

  test("cloud production keeps allowing http locally", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "cloud",
      APP_URL: "http://localhost:3000",
    });
    expect(result.success).toBe(true);
  });
});
