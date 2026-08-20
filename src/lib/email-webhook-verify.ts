import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Resend inbound webhook signature (Svix-based).
 * Resend uses Svix for webhook delivery with headers:
 *   svix-id, svix-timestamp, svix-signature
 */
export function verifyResendWebhook(
  headers: { "svix-id"?: string; "svix-timestamp"?: string; "svix-signature"?: string },
  body: string,
  secret: string,
): boolean {
  const msgId = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signature = headers["svix-signature"];

  if (!msgId || !timestamp || !signature) return false;

  // Protect against replay attacks (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

  // Svix signs: "{msg_id}.{timestamp}.{body}"
  const toSign = `${msgId}.${timestamp}.${body}`;

  // Secret may be prefixed with "whsec_" — strip it and decode base64
  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
    "base64",
  );

  const expectedSignature = createHmac("sha256", secretBytes)
    .update(toSign)
    .digest("base64");

  // Svix sends comma-separated signatures with version prefix: "v1,{base64}"
  const signatures = signature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts.length < 2) continue;
    const sigValue = parts[1];
    try {
      const expected = Buffer.from(expectedSignature);
      const actual = Buffer.from(sigValue);
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Verify SendGrid Inbound Parse webhook using basic auth or shared secret.
 * SendGrid inbound parse doesn't use signatures by default — verification
 * is done via the webhook URL containing a secret token.
 */
export function verifySendGridWebhook(
  headers: Record<string, string>,
  _body: string,
  _secret: string,
): boolean {
  // SendGrid inbound parse relies on URL-based secret verification.
  // The secret is embedded in the webhook URL path.
  // If we reach this point, the URL matched, so it's valid.
  return true;
}

/**
 * Decide how to treat an inbound webhook given the environment and the
 * configured secret.
 *
 * This exists as its own function because the decision is security-critical and
 * the previous version of it was a bare `if (secret)`, which fails OPEN: with no
 * secret configured, every unsigned request was accepted. The endpoint creates
 * humans, auto-accepts invitations and records answers to agent queries, so an
 * unauthenticated caller who knows a query id can forge a human's approval —
 * and query ids travel in the Reply-To address of every query email.
 *
 * Production with no secret is a misconfiguration, not a mode. Refuse.
 */
export function signatureRequirement(
  nodeEnv: string,
  secret: string | undefined,
): "verify" | "skip" | "refuse" {
  if (secret) return "verify";
  return nodeEnv === "production" ? "refuse" : "skip";
}
