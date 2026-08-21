import type { MailboxClient } from "../lib/mailbox";
import { withLock } from "../lib/redis-lock";
import {
  classifyRecipients,
  replyAddressConfig,
  type ReplyAddressConfig,
} from "../lib/reply-address";
import { processEmailReply } from "./email-response.service";
import { sendSenderMismatchNotice } from "./query-email.service";

/**
 * Walk the unread messages in the mailbox, hand each reply to the same domain
 * function the provider webhook calls, and decide what happens to the message
 * afterwards.
 *
 * That decision is the whole point of this file. Marking a message read is
 * irreversible from the ingest's side, so it is only done when reprocessing
 * could not possibly help. Anything that a later pass might succeed at is left
 * unread and retried in five minutes.
 *
 * Reprocessing is safe: processEmailReply answers already_answered for a query
 * that has one, so a message that was processed and then failed to be marked
 * read costs a wasted lookup and nothing else.
 */

export interface IngestSummary {
  /** Unread messages the pass looked at. */
  scanned: number;
  /** Replies recorded against their query. */
  processed: number;
  /** Replies from someone other than the target. */
  rejected: number;
  /** Ours, but unusable: malformed address, unknown query, expired, empty. */
  dropped: number;
  /** Somebody else's mail. Left unread and untouched. */
  skipped: number;
  /** Left unread on purpose, to be retried by the next pass. */
  deferred: number;
}

export interface IngestDeps {
  config?: ReplyAddressConfig;
  processReply?: typeof processEmailReply;
  notifySenderMismatch?: (toEmail: string) => Promise<unknown>;
}

export async function ingestPendingReplies(
  client: MailboxClient,
  deps: IngestDeps = {},
): Promise<IngestSummary> {
  const config = deps.config ?? replyAddressConfig();
  const processReply = deps.processReply ?? processEmailReply;
  const notifySenderMismatch = deps.notifySenderMismatch ?? sendSenderMismatchNotice;

  const summary: IngestSummary = {
    scanned: 0,
    processed: 0,
    rejected: 0,
    dropped: 0,
    skipped: 0,
    deferred: 0,
  };

  const uids = await client.listUnread();

  for (const uid of uids) {
    summary.scanned++;

    let message;
    try {
      message = await client.fetch(uid);
    } catch (err) {
      console.error(`[EMAIL-INGEST] Failed to fetch message ${uid}:`, err);
      summary.deferred++;
      continue;
    }

    if (!message) {
      console.warn(`[EMAIL-INGEST] Message ${uid} could not be read; leaving unread`);
      summary.deferred++;
      continue;
    }

    const match = classifyRecipients(message.recipients, config);

    if (match.kind === "foreign") {
      // Not addressed to the reply alias. A person uses this mailbox too.
      summary.skipped++;
      continue;
    }

    if (match.kind === "malformed") {
      console.warn(`[EMAIL-INGEST] Message ${uid} has no usable query id; dropping`);
      await markRead(client, uid);
      summary.dropped++;
      continue;
    }

    let result;
    try {
      result = await processReply({
        queryId: match.queryId,
        senderEmail: message.from,
        replyText: message.text,
      });
    } catch (err) {
      // The database, not the message. Leave it unread and try again in five
      // minutes rather than losing the human's answer.
      console.error(
        `[EMAIL-INGEST] Transient failure on message ${uid} (query ${match.queryId}):`,
        err,
      );
      summary.deferred++;
      continue;
    }

    if ("sender_mismatch" in result) {
      // Say something rather than swallowing the reply in silence.
      try {
        await notifySenderMismatch(message.from);
      } catch (err) {
        console.error(`[EMAIL-INGEST] Could not notify ${message.from}:`, err);
      }
      await markRead(client, uid);
      summary.rejected++;
      continue;
    }

    if ("success" in result) {
      summary.processed++;
    } else {
      // not_found, expired, already_answered, empty_reply — all permanent.
      console.log(`[EMAIL-INGEST] Message ${uid} dropped:`, result);
      summary.dropped++;
    }

    await markRead(client, uid);
  }

  console.log("[EMAIL-INGEST] Pass complete:", summary);
  return summary;
}

/**
 * Marking read is best effort. Failing at it after the reply was recorded is
 * harmless — the next pass sees already_answered — and failing the whole pass
 * over it would be worse.
 */
async function markRead(client: MailboxClient, uid: number): Promise<void> {
  try {
    await client.markRead(uid);
  } catch (err) {
    console.error(`[EMAIL-INGEST] Could not mark message ${uid} read:`, err);
  }
}

const INGEST_LOCK_KEY = "lock:email-ingest";

/**
 * Two minutes: four times the five-minute poll interval would be pointless, and
 * anything shorter than a slow pass would let a second one start on top of it.
 * A pass that dies without releasing the lock costs one skipped interval.
 */
const INGEST_LOCK_TTL_MS = 120_000;

/**
 * One pass, under the lock. Returns null when another pass is already running,
 * which is a normal outcome and not an error.
 */
export async function runEmailIngestPass(
  client: MailboxClient,
  deps: IngestDeps = {},
): Promise<IngestSummary | null> {
  return withLock(INGEST_LOCK_KEY, INGEST_LOCK_TTL_MS, () =>
    ingestPendingReplies(client, deps),
  );
}
