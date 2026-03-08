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
  const prefix = token.slice(0, 15);

  const db = getDb();
  const [human] = await db
    .select()
    .from(humans)
    .where(eq(humans.sessionTokenPrefix, prefix))
    .limit(1);

  if (!human || !human.sessionTokenHash || !human.sessionExpiresAt) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  if (new Date() > human.sessionExpiresAt) {
    throw new UnauthorizedError("Session expired");
  }

  const valid = await verifyToken(token, human.sessionTokenHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid session token");
  }

  c.set("human", human);
  c.set("humanId", human.id);
  await next();
};
