import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { env } from "../env";

/**
 * Reading the mailbox is a scaffold. It is behind an interface so the ingest
 * service can be tested whole with a double — no network, no credentials — and
 * so removing it the day a transactional provider posts to the inbound webhook
 * is deleting a file rather than unpicking a service.
 *
 * Nothing here is specific to Gmail, which is why it is not called GmailClient.
 */

export interface MailboxMessage {
  uid: number;
  /** Every To and Cc address, as written in the headers. */
  recipients: string[];
  /** The sender, lowercased. */
  from: string;
  /** The plain text body, before quote stripping. */
  text: string;
}

export interface MailboxClient {
  listUnread(): Promise<number[]>;
  fetch(uid: number): Promise<MailboxMessage | null>;
  markRead(uid: number): Promise<void>;
  close(): Promise<void>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/**
 * The IMAP settings, or null when the mailbox is not configured. Null is a
 * supported state: without it the poll endpoint answers 503 and nothing else
 * in the system behaves differently.
 */
export function imapConfig(): ImapConfig | null {
  const e = env();
  if (!e.IMAP_HOST || !e.IMAP_USER || !e.IMAP_PASSWORD) return null;
  return {
    host: e.IMAP_HOST,
    port: e.IMAP_PORT,
    user: e.IMAP_USER,
    password: e.IMAP_PASSWORD,
  };
}

function addressList(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];
  return objects.flatMap((o) =>
    (o.value ?? []).map((v) => v.address).filter((a): a is string => Boolean(a)),
  );
}

export async function parseRawMessage(
  uid: number,
  source: Buffer | string,
): Promise<MailboxMessage | null> {
  const parsed = await simpleParser(source);

  const from = parsed.from?.value?.[0]?.address;
  if (!from) return null;

  return {
    uid,
    recipients: [...addressList(parsed.to), ...addressList(parsed.cc)],
    from: from.toLowerCase(),
    // mailparser returns "\n" rather than "" for an empty plain-text body, so
    // trimming (not just a null fallback) is what actually yields "".
    text: (parsed.text ?? "").trim(),
  };
}

/**
 * Connect to the mailbox and hold the INBOX lock for the life of the client.
 * Gmail cuts off around fifteen simultaneous IMAP connections, so a pass opens
 * exactly one and the caller always closes it.
 */
export async function openMailbox(config: ImapConfig): Promise<MailboxClient> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  return {
    async listUnread() {
      const uids = await client.search({ seen: false }, { uid: true });
      return uids === false ? [] : uids;
    },

    async fetch(uid: number) {
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) return null;
      return parseRawMessage(uid, message.source);
    },

    async markRead(uid: number) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    },

    async close() {
      lock.release();
      await client.logout().catch(() => client.close());
    },
  };
}
