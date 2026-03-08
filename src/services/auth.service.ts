import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { humans } from "../db/schema/humans";
import { invitations } from "../db/schema/invitations";
import { conversationParticipants } from "../db/schema/participants";
import {
  generateVerificationCode,
  generateSessionToken,
  hashToken,
  verifyToken,
} from "../lib/crypto";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { env } from "../env";
import { getOrCreateHuman } from "./human.service";

export async function createVerificationCode(email: string) {
  const db = getDb();

  // Check that the email has at least one pending invitation or is already a participant
  const [pendingInvitation] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.invitedHumanEmail, email),
        eq(invitations.status, "pending"),
      ),
    )
    .limit(1);

  if (!pendingInvitation) {
    const [human] = await db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.email, email))
      .limit(1);

    if (!human) {
      throw new ForbiddenError("No invitations found. You need an invitation from an agent to sign in.");
    }

    const [existingParticipation] = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.humanId, human.id),
          eq(conversationParticipants.actorType, "human"),
        ),
      )
      .limit(1);

    if (!existingParticipation) {
      throw new ForbiddenError("No invitations found. You need an invitation from an agent to sign in.");
    }
  }

  const human = await getOrCreateHuman(email);
  const code = generateVerificationCode();
  const codeHash = await hashToken(code);
  const e = env();
  const expiresAt = new Date(Date.now() + e.VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

  await db
    .update(humans)
    .set({
      verificationCodeHash: codeHash,
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, human.id));

  return { code, human };
}

export async function verifyCode(email: string, code: string) {
  const db = getDb();
  const e = env();

  const [human] = await db
    .select()
    .from(humans)
    .where(eq(humans.email, email))
    .limit(1);

  if (!human || !human.verificationCodeHash || !human.verificationCodeExpiresAt) {
    throw new UnauthorizedError("Invalid or expired verification code");
  }

  if (new Date() > human.verificationCodeExpiresAt) {
    throw new UnauthorizedError("Verification code has expired");
  }

  if (human.verificationAttempts >= e.VERIFICATION_MAX_ATTEMPTS) {
    throw new UnauthorizedError("Too many failed attempts. Please request a new code.");
  }

  const valid = await verifyToken(code, human.verificationCodeHash);

  if (!valid) {
    await db
      .update(humans)
      .set({
        verificationAttempts: human.verificationAttempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, human.id));
    throw new UnauthorizedError("Invalid verification code");
  }

  // Create session
  const sessionToken = generateSessionToken();
  const sessionHash = await hashToken(sessionToken);
  const sessionPrefix = sessionToken.slice(0, 15);
  const sessionExpires = new Date(Date.now() + e.SESSION_EXPIRY_HOURS * 3600 * 1000);

  await db
    .update(humans)
    .set({
      verificationCodeHash: null,
      verificationCodeExpiresAt: null,
      verificationAttempts: 0,
      sessionTokenHash: sessionHash,
      sessionTokenPrefix: sessionPrefix,
      sessionExpiresAt: sessionExpires,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, human.id));

  return { sessionToken, human };
}

export async function logout(humanId: string) {
  const db = getDb();
  await db
    .update(humans)
    .set({
      sessionTokenHash: null,
      sessionTokenPrefix: null,
      sessionExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, humanId));
}
