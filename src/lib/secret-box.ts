import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../env";

/**
 * Reversible encryption for secrets we must be able to hand back out.
 *
 * This is deliberately NOT in lib/crypto.ts. That module is one-way hashing
 * for credentials we only ever compare; mixing the two is what produced a
 * webhook signature keyed with a bcrypt hash. Keep the boundary.
 */

export interface SealedSecret {
  ciphertext: string; // base64
  iv: string; // base64, 96 bits, fresh per seal
  tag: string; // base64, GCM authentication tag
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function encryptionKey(): Buffer {
  const configured = env().WEBHOOK_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(configured, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `WEBHOOK_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }

  return key;
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
