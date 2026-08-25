import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { randomInt } from "crypto";
import { getAuthConfig } from "../config/auth";

export function generateApiKey(): { key: string; prefix: string } {
  const config = getAuthConfig();
  const raw = nanoid(48);
  const key = `${config.apiKeyPrefix}${raw}`;
  const prefix = key.slice(0, config.apiKeyPrefix.length + 8);
  return { key, prefix };
}

export async function hashApiKey(key: string): Promise<string> {
  const config = getAuthConfig();
  return bcrypt.hash(key, config.apiKeySaltRounds);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

export function generateSessionToken(): string {
  const config = getAuthConfig();
  return `${config.sessionPrefix}${nanoid(48)}`;
}

export async function hashToken(token: string): Promise<string> {
  const config = getAuthConfig();
  return bcrypt.hash(token, config.apiKeySaltRounds);
}

export async function verifyToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

export function generateVerificationCode(): string {
  const code = randomInt(0, 1_000_000);
  return code.toString().padStart(6, "0");
}

export function generateInvitationToken(): string {
  return nanoid(32);
}
