import { describe, expect, it } from "bun:test";
import { withLock } from "../../src/lib/redis-lock";
import { getRedis } from "../../src/lib/redis";

/**
 * The scheduled poll can overlap with itself if a pass runs long. Overlapping
 * passes duplicate work and, worse, open extra IMAP connections — Gmail cuts
 * off around fifteen at once.
 */

function key(name: string) {
  return `test:lock:${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

describe("withLock", () => {
  it("runs the function and returns its value", async () => {
    const result = await withLock(key("runs"), 5_000, async () => "done");
    expect(result).toBe("done");
  });

  it("refuses a second holder while the first is running", async () => {
    const k = key("contended");
    let secondResult: string | null = "not run";

    const first = withLock(k, 5_000, async () => {
      secondResult = await withLock(k, 5_000, async () => "second");
      return "first";
    });

    expect(await first).toBe("first");
    expect(secondResult).toBeNull();
  });

  it("releases the lock so the next pass can take it", async () => {
    const k = key("released");
    expect(await withLock(k, 5_000, async () => "a")).toBe("a");
    expect(await withLock(k, 5_000, async () => "b")).toBe("b");
    expect(await getRedis().get(k)).toBeNull();
  });

  it("releases the lock when the function throws, and lets the error out", async () => {
    const k = key("throws");
    await expect(
      withLock(k, 5_000, async () => {
        throw new Error("pass failed");
      }),
    ).rejects.toThrow("pass failed");

    expect(await withLock(k, 5_000, async () => "after")).toBe("after");
  });

  it("expires on its own so a crashed holder does not block forever", async () => {
    const k = key("expiry");
    await withLock(k, 60_000, async () => {
      const ttl = await getRedis().pttl(k);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);
    });
  });
});

import { runEmailIngestPass } from "../../src/services/email-ingest.service";
import type { MailboxClient } from "../../src/lib/mailbox";

describe("runEmailIngestPass", () => {
  /** A mailbox that blocks in listUnread until the test lets it go. */
  function blockingMailbox(): { client: MailboxClient; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      release,
      client: {
        async listUnread() {
          await gate;
          return [];
        },
        async fetch() {
          return null;
        },
        async markRead() {},
        async close() {},
      },
    };
  }

  it("discards a second pass while the first is still running", async () => {
    const { client, release } = blockingMailbox();

    const first = runEmailIngestPass(client);
    // The second pass starts while the first is blocked inside listUnread.
    const second = await runEmailIngestPass({
      async listUnread() {
        throw new Error("the second pass must not reach the mailbox");
      },
      async fetch() {
        return null;
      },
      async markRead() {},
      async close() {},
    });

    expect(second).toBeNull();

    release();
    const summary = await first;
    expect(summary).not.toBeNull();
    expect(summary!.scanned).toBe(0);
  });
});
