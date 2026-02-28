import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { humans } from "../db/schema/humans";
import { verifyToken } from "../lib/crypto";
import { UnauthorizedError } from "../lib/errors";

export const humanAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer sess_")) {
    throw new UnauthorizedError("Missing or invalid session token");
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  const db = getDb();
  const allHumans = await db
    .select()
    .from(humans)
    .where(eq(humans.sessionTokenHash, humans.sessionTokenHash)); // We need to check all active sessions

  // Find the human with a matching session token
  let matchedHuman = null;
  for (const human of await db.select().from(humans)) {
    if (!human.sessionTokenHash || !human.sessionExpiresAt) continue;
    if (new Date() > human.sessionExpiresAt) continue;

    const valid = await verifyToken(token, human.sessionTokenHash);
    if (valid) {
      matchedHuman = human;
      break;
    }
  }

  if (!matchedHuman) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  c.set("human", matchedHuman);
  c.set("humanId", matchedHuman.id);
  await next();
};
