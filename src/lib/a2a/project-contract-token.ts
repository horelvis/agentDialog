import { nanoid } from "nanoid";

/**
 * The capability that reads a project's collaboration contract. Deliberately
 * not a session or agent token: it is checked against a bcrypt hash, never
 * stored or transmitted in plaintext beyond the one moment it is created.
 */

const PREFIX = "a2p_";
const BODY_SIZE = 48;
const PREFIX_LENGTH = 12;

export function generateProjectShareToken(): string {
  return `${PREFIX}${nanoid(BODY_SIZE)}`;
}

/** What the index holds. The full token is only ever compared against a hash. */
export function projectShareTokenPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH);
}