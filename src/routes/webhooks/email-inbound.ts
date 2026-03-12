import { Hono } from "hono";
import { env } from "../../env";
import { verifyResendWebhook, verifySendGridWebhook } from "../../lib/email-webhook-verify";
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

  // 1. Verify webhook signature (if secret is configured)
  if (e.INBOUND_EMAIL_WEBHOOK_SECRET) {
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
        e.INBOUND_EMAIL_WEBHOOK_SECRET,
      );
    } else if (provider === "sendgrid") {
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((v, k) => { headers[k] = v; });
      valid = verifySendGridWebhook(headers, rawBody, e.INBOUND_EMAIL_WEBHOOK_SECRET);
    }

    if (!valid) {
      console.warn("[EMAIL-INBOUND] Invalid webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // 2. Parse payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[EMAIL-INBOUND] Invalid JSON payload");
    return c.json({ error: "Invalid payload" }, 400);
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

  // 3. Extract queryId from reply-to address
  const queryId = extractQueryId(toAddress);
  if (!queryId) {
    console.warn(`[EMAIL-INBOUND] Could not extract queryId from: ${toAddress}`);
    return c.json({ ok: true }); // Don't retry
  }

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

/**
 * Extract queryId from a reply address like "reply+{queryId}@reply.agentdialog.io"
 */
function extractQueryId(toAddress: string): string | null {
  const match = toAddress.match(/reply\+([^@]+)@/);
  return match ? match[1] : null;
}

export default app;
