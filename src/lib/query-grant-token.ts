import { nanoid } from "nanoid";

/**
 * A capability to resolve one query, mailed to one address. Deliberately not a
 * session token: it is checked by src/middleware/query-grant-auth.ts, which
 * never issues `sess_`.
 */

const PREFIX = "qgr_";
const BODY_SIZE = 48;
const PREFIX_LENGTH = 15;

export function generateGrantToken(): string {
  return `${PREFIX}${nanoid(BODY_SIZE)}`;
}

/** What the index holds. The full token is only ever compared against a hash. */
export function grantTokenPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH);
}

/**
 * Which risks a one-click link may resolve. High and critical mint no grant at
 * all rather than minting one that then demands a code — two authentication
 * models on one route is a half-authenticated state nobody can reason about.
 */
export function shouldMintGrant(risk: "low" | "medium" | "high" | "critical"): boolean {
  return risk === "low" || risk === "medium";
}
