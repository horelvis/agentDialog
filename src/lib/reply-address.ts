import { env } from "../env";

/**
 * DORMANT. Nothing sends a per-query Reply-To today — inbound email is not read
 * at all, and a human answers in the web app. `classifyRecipient` is still
 * reachable from the provider webhook, which no provider calls; the builder has
 * no caller. Both halves are kept together deliberately, because splitting them
 * is what caused the bug this module was written to fix, and because they are
 * what a transactional provider would switch back on. See docs/operations.md.
 *
 * Building the Reply-To address and reading the query id back out of the
 * human's reply are two halves of one contract. They used to live in two files
 * — the sender in query-email.service.ts, the reader in the inbound webhook —
 * with two literals that had to agree and nothing checking that they did.
 */

export interface ReplyAddressConfig {
  localPart: string;
  domain: string;
}

export type RecipientMatch =
  | { kind: "reply"; queryId: string }
  | { kind: "malformed" }
  | { kind: "foreign" };

/**
 * Query ids are `uuid.defaultRandom()` values (db/schema/human-queries.ts).
 * Validating the shape is what keeps somebody else's mail to
 * `<account>+newsletter@gmail.com` from being read as a reply, looked up,
 * missed, and marked read — quietly consuming mail the mailbox owner wanted.
 */
const QUERY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function replyAddressConfig(): ReplyAddressConfig {
  const e = env();
  return { localPart: e.REPLY_LOCAL_PART, domain: e.REPLY_DOMAIN };
}

export function buildReplyToAddress(
  queryId: string,
  config: ReplyAddressConfig = replyAddressConfig(),
): string {
  return `${config.localPart}+${queryId}@${config.domain}`;
}

/** Pull the bare address out of `Name <addr>` or a plain address. */
export function extractBareAddress(input: string): string | null {
  const angled = input.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : input).trim();
  return candidate.includes("@") ? candidate : null;
}

export function classifyRecipient(
  address: string,
  config: ReplyAddressConfig = replyAddressConfig(),
): RecipientMatch {
  const bare = extractBareAddress(address);
  if (!bare) return { kind: "foreign" };

  const at = bare.lastIndexOf("@");
  if (at <= 0) return { kind: "foreign" };

  const local = bare.slice(0, at).toLowerCase();
  const domain = bare.slice(at + 1).toLowerCase();
  if (domain !== config.domain.toLowerCase()) return { kind: "foreign" };

  const plus = local.indexOf("+");
  if (plus === -1) return { kind: "foreign" };
  if (local.slice(0, plus) !== config.localPart.toLowerCase()) {
    return { kind: "foreign" };
  }

  const tag = local.slice(plus + 1);
  return QUERY_ID_PATTERN.test(tag)
    ? { kind: "reply", queryId: tag }
    : { kind: "malformed" };
}

/**
 * Classify every recipient of a message and report the most actionable result:
 * a usable reply address wins over a malformed one, which wins over none.
 * A reply can arrive with the alias in Cc rather than To.
 */
export function classifyRecipients(
  addresses: string[],
  config: ReplyAddressConfig = replyAddressConfig(),
): RecipientMatch {
  let sawMalformed = false;
  for (const address of addresses) {
    const match = classifyRecipient(address, config);
    if (match.kind === "reply") return match;
    if (match.kind === "malformed") sawMalformed = true;
  }
  return sawMalformed ? { kind: "malformed" } : { kind: "foreign" };
}
