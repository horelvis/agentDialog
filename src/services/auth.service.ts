import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { humans } from "../db/schema/humans";
import {
  generateMagicLinkToken,
  generateSessionToken,
  hashToken,
  verifyToken,
} from "../lib/crypto";
import { UnauthorizedError } from "../lib/errors";
import { env } from "../env";
import { getOrCreateHuman } from "./human.service";

export async function createMagicLink(email: string) {
  const db = getDb();
  const human = await getOrCreateHuman(email);
  const token = generateMagicLinkToken();
  const tokenHash = await hashToken(token);
  const e = env();
  const expiresAt = new Date(Date.now() + e.MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  await db
    .update(humans)
    .set({
      magicLinkToken: tokenHash,
      magicLinkExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, human.id));

  return { token, human };
}

export async function verifyMagicLink(token: string) {
  const db = getDb();

  // Find humans with non-expired magic links
  const allHumans = await db.select().from(humans);

  for (const human of allHumans) {
    if (!human.magicLinkToken || !human.magicLinkExpiresAt) continue;
    if (new Date() > human.magicLinkExpiresAt) continue;

    const valid = await verifyToken(token, human.magicLinkToken);
    if (valid) {
      // Create session
      const sessionToken = generateSessionToken();
      const sessionHash = await hashToken(sessionToken);
      const e = env();
      const sessionExpires = new Date(Date.now() + e.SESSION_EXPIRY_HOURS * 3600 * 1000);

      await db
        .update(humans)
        .set({
          magicLinkToken: null,
          magicLinkExpiresAt: null,
          sessionTokenHash: sessionHash,
          sessionExpiresAt: sessionExpires,
          updatedAt: new Date(),
        })
        .where(eq(humans.id, human.id));

      return { sessionToken, human };
    }
  }

  throw new UnauthorizedError("Invalid or expired magic link");
}

export async function logout(humanId: string) {
  const db = getDb();
  await db
    .update(humans)
    .set({
      sessionTokenHash: null,
      sessionExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, humanId));
}
