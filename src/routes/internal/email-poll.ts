import { createHash, timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { env } from "../../env";
import { imapConfig, openMailbox, type MailboxClient } from "../../lib/mailbox";
import { runEmailIngestPass } from "../../services/email-ingest.service";

const app = new Hono();

/**
 * POST /api/v1/internal/email/poll
 *
 * Called by Cloud Scheduler every five minutes. Reads the unread mail in the
 * inbound mailbox and records any replies against their queries.
 *
 * This is the scaffold half of inbound email, and it is temporary by design:
 * the day a transactional provider posts to /api/v1/webhooks/email/inbound,
 * this file, src/lib/mailbox.ts and src/services/email-ingest.service.ts are
 * deleted, along with the Scheduler job. That also means removing this file's
 * import and mount in src/app.ts, and the IMAP_* / INTERNAL_POLL_SECRET
 * fields from src/env.ts and .env.example — it is not a clean deletion of
 * just the service files. See the full retirement checklist in
 * docs/operations.md ("Inbound email: a scaffold with an exit criterion").
 */
app.post("/poll", async (c) => {
  const e = env();

  // 1. Authenticate.
  //
  // Unset means refuse, in every environment. The endpoint records a human's
  // answer to an agent's question, so there is no environment in which running
  // it unauthenticated is the convenient default — a developer who wants it
  // locally sets the variable, which .env.example already does.
  const secret = e.INTERNAL_POLL_SECRET;
  const provided = c.req.header("x-internal-secret") ?? "";
  if (!secret || !secretsMatch(provided, secret)) {
    if (!secret) {
      console.error("[EMAIL-POLL] Refusing: no INTERNAL_POLL_SECRET configured");
    }
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid or missing internal secret" } },
      401,
    );
  }

  // 2. Is there a mailbox to read?
  const config = imapConfig();
  if (!config) {
    return c.json(
      {
        error: {
          code: "MAILBOX_NOT_CONFIGURED",
          message: "Inbound mailbox is not configured",
        },
      },
      503,
    );
  }

  // 3. One connection per pass, always closed.
  let client: MailboxClient;
  try {
    client = await openMailbox(config);
  } catch (err) {
    console.error("[EMAIL-POLL] Could not open the mailbox:", err);
    return c.json(
      { error: { code: "MAILBOX_UNAVAILABLE", message: "Could not open the mailbox" } },
      502,
    );
  }

  try {
    const summary = await runEmailIngestPass(client);
    if (!summary) {
      // Another pass holds the lock. Normal, not an error.
      return c.json({ data: { skipped: true, reason: "another pass is running" } });
    }
    return c.json({ data: summary });
  } catch (err) {
    console.error("[EMAIL-POLL] Pass failed:", err);
    return c.json(
      { error: { code: "INGEST_FAILED", message: "Ingest pass failed" } },
      500,
    );
  } finally {
    await client.close().catch((err) => {
      console.error("[EMAIL-POLL] Could not close the mailbox:", err);
    });
  }
});

/**
 * Compare through a digest so the comparison is constant time and the length of
 * the real secret does not leak from the length of the buffers.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export default app;
