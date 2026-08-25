import { createHmac, randomBytes } from "crypto";
import { nanoid } from "nanoid";

/**
 * Standard Webhooks (https://www.standardwebhooks.com).
 *
 * The signed content is `msg_id.timestamp.payload`, so the timestamp cannot be
 * altered without invalidating the signature — which is what makes a captured
 * delivery non-replayable. The consumer verifies with any off-the-shelf
 * implementation; nothing here is ours to invent.
 */

const SECRET_PREFIX = "whsec_";
const SECRET_BYTES = 32;
const MESSAGE_ID_SIZE = 27;

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString("base64")}`;
}

export function generateMessageId(): string {
  return `msg_${nanoid(MESSAGE_ID_SIZE)}`;
}

export function buildSignedContent(msgId: string, timestamp: number, body: string): string {
  return `${msgId}.${timestamp}.${body}`;
}

/**
 * The key is the secret's decoded bytes, not the string. Signing the literal
 * produces a signature every standard verifier rejects, with no clue why.
 */
export function signPayload(
  secret: string,
  msgId: string,
  timestamp: number,
  body: string,
): string {
  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    "base64",
  );

  const signature = createHmac("sha256", key)
    .update(buildSignedContent(msgId, timestamp, body))
    .digest("base64");

  return `v1,${signature}`;
}

/** One signature per live secret, space delimited, so a rotation never drops a delivery. */
export function signatureHeader(
  secrets: string[],
  msgId: string,
  timestamp: number,
  body: string,
): string {
  return secrets.map((secret) => signPayload(secret, msgId, timestamp, body)).join(" ");
}
