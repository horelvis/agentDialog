import { Hono } from "hono";
import { env } from "../../env";
import {
  signatureRequirement,
  verifyResendWebhook,
  verifySendGridWebhook,
} from "../../lib/email-webhook-verify";
import { classifyRecipient } from "../../lib/reply-address";
import { processEmailReply } from "../../services/email-response.service";

const app = new Hono();

/**
 * POST /api/v1/webhooks/email/inbound
 *
 * Receives inbound email webhooks from Resend or SendGrid.
 * Public endpoint — authenticated via webhook signature verification.
 */
app.post("/inbound", async (c) => {
  const e = env();
  const rawBody = await c.req.text();

  // 1. Verify webhook signature.
  //
  // This decides verify / skip / refuse rather than testing the secret inline,
  // because the inline version failed OPEN: with no secret configured every
  // unsigned request was accepted, and this endpoint records a human's answer
  // and auto-accepts their invitation. Env validation should stop a production
  // deploy without a secret from starting at all; this is the second lock.
  const secret = e.INBOUND_EMAIL_WEBHOOK_SECRET;
  const requirement = signatureRequirement(e.NODE_ENV, secret);

  if (requirement === "refuse") {
    console.error(
      "[EMAIL-INBOUND] Refusing request: no INBOUND_EMAIL_WEBHOOK_SECRET configured in production",
    );
    return c.json(
      {
        error: {
          code: "WEBHOOK_NOT_CONFIGURED",
          message: "Inbound email webhook is not configured",
        },
      },
      503,
    );
  }

  if (requirement === "skip") {
    console.warn(
      "[EMAIL-INBOUND] No signing secret configured — signature verification skipped (non-production)",
    );
  }

  if (secret) {
    const provider = e.INBOUND_EMAIL_PROVIDER;
    let valid = false;

    if (provider === "resend") {
      valid = verifyResendWebhook(
        {
          "svix-id": c.req.header("svix-id"),
          "svix-timestamp": c.req.header("svix-timestamp"),
          "svix-signature": c.req.header("svix-signature"),
        },
        rawBody,
        secret,
      );
    } else if (provider === "sendgrid") {
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((v, k) => { headers[k] = v; });
      valid = verifySendGridWebhook(headers, rawBody, secret);
    }

    if (!valid) {
      console.warn("[EMAIL-INBOUND] Invalid webhook signature");
      return c.json(
        { error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" } },
        401,
      );
    }
  }

  // 2. Parse payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[EMAIL-INBOUND] Invalid JSON payload");
    return c.json(
      { error: { code: "INVALID_PAYLOAD", message: "Invalid JSON payload" } },
      400,
    );
  }

  // Resend inbound webhook payload structure:
  // { type: "email.received", data: { from, to, subject, text, html, headers, ... } }
  const emailData = payload.data || payload;

  const toAddress = extractToAddress(emailData);
  const fromAddress = extractFromAddress(emailData);
  const textBody = emailData.text || emailData.plain || "";

  if (!toAddress || !fromAddress) {
    console.warn("[EMAIL-INBOUND] Missing from/to in payload");
    return c.json({ ok: true }); // Don't retry
  }

  // 3. Extract queryId from the reply address
  const match = classifyRecipient(toAddress);
  if (match.kind !== "reply") {
    console.warn(
      `[EMAIL-INBOUND] Not a reply address (${match.kind}): ${toAddress}`,
    );
    return c.json({ ok: true }); // Don't retry
  }
  const queryId = match.queryId;

  // 4. Process the reply
  try {
    const result = await processEmailReply({
      queryId,
      senderEmail: fromAddress,
      replyText: textBody,
    });

    console.log(`[EMAIL-INBOUND] Processed reply for query ${queryId}:`, result);
    return c.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[EMAIL-INBOUND] Error processing reply for query ${queryId}:`, err);
    // Return 200 to prevent webhook retries for application errors
    return c.json({ ok: true, error: "Processing failed" });
  }
});

/**
 * Extract the "to" email address from various provider formats.
 */
function extractToAddress(data: any): string | null {
  // Resend: data.to is a string or array
  if (typeof data.to === "string") return data.to;
  if (Array.isArray(data.to) && data.to.length > 0) {
    // Could be array of strings or objects with address field
    const first = data.to[0];
    return typeof first === "string" ? first : first?.address || first?.email || null;
  }
  // SendGrid: data.envelope.to
  if (data.envelope?.to) {
    const to = data.envelope.to;
    return Array.isArray(to) ? to[0] : to;
  }
  return null;
}

/**
 * Extract the "from" email address from various provider formats.
 */
function extractFromAddress(data: any): string | null {
  if (typeof data.from === "string") {
    // Handle "Name <email>" format
    const match = data.from.match(/<([^>]+)>/);
    return match ? match[1] : data.from;
  }
  if (typeof data.from === "object" && data.from) {
    return data.from.address || data.from.email || null;
  }
  // SendGrid: data.envelope.from
  if (data.envelope?.from) return data.envelope.from;
  return null;
}

export default app;
