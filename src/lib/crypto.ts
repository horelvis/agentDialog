import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { createHmac, randomBytes } from "crypto";
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

export function generateMagicLinkToken(): string {
  return nanoid(64);
}

export function generateInvitationToken(): string {
  return nanoid(32);
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
