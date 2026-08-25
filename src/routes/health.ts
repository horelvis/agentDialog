import { Hono } from "hono";
import { appVersion } from "../lib/app-version";
import type { AppEnv } from "../types/hono";
import { getDb } from "../db";
import { getRedis } from "../lib/redis";
import { sql } from "drizzle-orm";
import { connectionManager } from "../ws/connection-manager";

const app = new Hono<AppEnv>();

app.get("/health", async (c) => {
  const checks: Record<string, string> = {};

  // Database check
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  // Redis check
  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  const wsStats = connectionManager.getStats();

  const allOk = Object.values(checks).every((v) => v === "ok");

  return c.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      websocket: wsStats,
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503,
  );
});

app.get("/", (c) => {
  return c.json({
    name: "AgentDialog",
    version: appVersion(),
    description: "Agent-first messaging platform",
    docs: "/api/v1",
    health: "/health",
  });
});

export default app;
