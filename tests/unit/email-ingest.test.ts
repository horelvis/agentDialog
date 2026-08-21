import { describe, expect, it } from "bun:test";
import { ingestPendingReplies } from "../../src/services/email-ingest.service";
import type { MailboxClient, MailboxMessage } from "../../src/lib/mailbox";

/**
 * The whole ingest runs against a double. What it decides per message is the
 * expensive thing to get wrong: treat a transient failure as permanent and the
 * answer is lost for good; treat a permanent one as transient and the mailbox
 * loops on it every five minutes forever.
 */

const QUERY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const CONFIG = { localPart: "agentdialog.app", domain: "gmail.com" };

function message(overrides: Partial<MailboxMessage> = {}): MailboxMessage {
  return {
    uid: 1,
    recipients: [`agentdialog.app+${QUERY_ID}@gmail.com`],
    from: "ada@example.com",
    text: "No. Wait until Monday.",
    ...overrides,
  };
}

class FakeMailbox implements MailboxClient {
  readonly read: number[] = [];
  closed = false;

  constructor(private readonly messages: MailboxMessage[]) {}

  async listUnread() {
    return this.messages.map((m) => m.uid);
  }
  async fetch(uid: number) {
    return this.messages.find((m) => m.uid === uid) ?? null;
  }
  async markRead(uid: number) {
    this.read.push(uid);
  }
  async close() {
    this.closed = true;
  }
}

/** Records what the ingest asked of the domain, and answers what the test wants. */
function fakeDeps(
  reply: (input: { queryId: string; senderEmail: string; replyText: string }) => Promise<any>,
) {
  const notified: string[] = [];
  const calls: Array<{ queryId: string; senderEmail: string; replyText: string }> = [];
  return {
    notified,
    calls,
    deps: {
      config: CONFIG,
      processReply: async (input: any) => {
        calls.push(input);
        return reply(input);
      },
      notifySenderMismatch: async (to: string) => {
        notified.push(to);
      },
    },
  };
}

describe("ingestPendingReplies", () => {
  it("processes a valid reply and marks it read", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([
      { queryId: QUERY_ID, senderEmail: "ada@example.com", replyText: "No. Wait until Monday." },
    ]);
    expect(mailbox.read).toEqual([1]);
    expect(summary).toEqual({
      scanned: 1, processed: 1, rejected: 0, dropped: 0, skipped: 0, deferred: 0,
    });
  });

  // Addressed to us, but the tag is not a query id. Retrying cannot fix it.
  it("marks a malformed reply address read without processing it", async () => {
    const mailbox = new FakeMailbox([
      message({ recipients: ["agentdialog.app+not-a-query@gmail.com"] }),
    ]);
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([]);
    expect(mailbox.read).toEqual([1]);
    expect(summary.dropped).toBe(1);
  });

  // The mailbox belongs to a person as well. Their mail must survive the pass.
  it("leaves foreign mail untouched and unread", async () => {
    const mailbox = new FakeMailbox([
      message({ recipients: ["agentdialog.app@gmail.com"] }),
      message({ uid: 2, recipients: ["someone-else@example.com"] }),
    ]);
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([]);
    expect(mailbox.read).toEqual([]);
    expect(summary).toEqual({
      scanned: 2, processed: 0, rejected: 0, dropped: 0, skipped: 2, deferred: 0,
    });
  });

  it("marks a reply to a query that does not exist read", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps } = fakeDeps(async () => ({ not_found: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1]);
    expect(summary.dropped).toBe(1);
  });

  it("marks an already answered query read and does nothing else", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps, notified } = fakeDeps(async () => ({ already_answered: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1]);
    expect(notified).toEqual([]);
    expect(summary.dropped).toBe(1);
  });

  it("marks an expired query read", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps } = fakeDeps(async () => ({ expired: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1]);
    expect(summary.dropped).toBe(1);
  });

  it("notifies the sender of a mismatch, and marks the message read", async () => {
    const mailbox = new FakeMailbox([message({ from: "intruder@example.com" })]);
    const { deps, notified } = fakeDeps(async () => ({ sender_mismatch: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(notified).toEqual(["intruder@example.com"]);
    expect(mailbox.read).toEqual([1]);
    expect(summary).toEqual({
      scanned: 1, processed: 0, rejected: 1, dropped: 0, skipped: 0, deferred: 0,
    });
  });

  // The one case where the message must survive: five minutes later it works.
  it("leaves a message unread when processing fails transiently", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps } = fakeDeps(async () => {
      throw new Error("connection terminated unexpectedly");
    });

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([]);
    expect(summary).toEqual({
      scanned: 1, processed: 0, rejected: 0, dropped: 0, skipped: 0, deferred: 1,
    });
  });

  it("keeps going after one message fails", async () => {
    const mailbox = new FakeMailbox([
      message({ uid: 1 }),
      message({ uid: 2, text: "boom" }),
      message({ uid: 3 }),
    ]);
    const { deps } = fakeDeps(async (input) => {
      if (input.replyText === "boom") throw new Error("db down");
      return { success: true, query_id: QUERY_ID };
    });

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1, 3]);
    expect(summary).toEqual({
      scanned: 3, processed: 2, rejected: 0, dropped: 0, skipped: 0, deferred: 1,
    });
  });

  it("defers a message it cannot fetch", async () => {
    const mailbox = new FakeMailbox([]);
    // listUnread reports a uid that fetch cannot return.
    mailbox.listUnread = async () => [99];
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([]);
    expect(mailbox.read).toEqual([]);
    expect(summary.deferred).toBe(1);
  });

  it("does not fail the pass when the mismatch notice cannot be sent", async () => {
    const mailbox = new FakeMailbox([message({ from: "intruder@example.com" })]);
    const summary = await ingestPendingReplies(mailbox, {
      config: CONFIG,
      processReply: async () => ({ sender_mismatch: true }),
      notifySenderMismatch: async () => {
        throw new Error("smtp down");
      },
    });

    expect(mailbox.read).toEqual([1]);
    expect(summary.rejected).toBe(1);
  });

  it("reports an empty mailbox without touching anything", async () => {
    const mailbox = new FakeMailbox([]);
    const { deps } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(summary).toEqual({
      scanned: 0, processed: 0, rejected: 0, dropped: 0, skipped: 0, deferred: 0,
    });
  });
});
