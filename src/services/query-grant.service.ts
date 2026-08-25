import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { queryGrants } from "../db/schema/query-grants";
import { hashToken, verifyToken } from "../lib/crypto";
import { generateGrantToken, grantTokenPrefix } from "../lib/query-grant-token";
import { UnauthorizedError } from "../lib/errors";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Mint a capability for one query. Returns the plaintext token, which is the
 * only time it exists in readable form — the row keeps a bcrypt hash.
 *
 * `tx` lets the caller mint inside the transaction that creates the query, so a
 * rolled-back query leaves no grant behind.
 */
export async function mintQueryGrant(
  queryId: string,
  humanEmail: string,
  expiresAt: Date,
  tx?: Tx,
): Promise<string> {
  const db = tx ?? getDb();
  const token = generateGrantToken();

  await db.insert(queryGrants).values({
    queryId,
    humanEmail,
    tokenPrefix: grantTokenPrefix(token),
    tokenHash: await hashToken(token),
    expiresAt,
  });

  return token;
}

/**
 * Resolve a token to the query it may resolve. Every failure is the same
 * UnauthorizedError: an unknown token, an expired one and a spent one must not
 * be distinguishable from outside, or the endpoint becomes an oracle telling a
 * stranger which links once existed.
 */
export async function resolveQueryGrant(
  token: string,
): Promise<{ grantId: string; queryId: string; humanEmail: string }> {
  const db = getDb();

  const [grant] = await db
    .select()
    .from(queryGrants)
    .where(and(eq(queryGrants.tokenPrefix, grantTokenPrefix(token)), isNull(queryGrants.consumedAt)))
    .limit(1);

  if (!grant) throw new UnauthorizedError("This link is not valid");
  if (new Date() > grant.expiresAt) throw new UnauthorizedError("This link is not valid");

  const valid = await verifyToken(token, grant.tokenHash);
  if (!valid) throw new UnauthorizedError("This link is not valid");

  return { grantId: grant.id, queryId: grant.queryId, humanEmail: grant.humanEmail };
}

/** Spend the grant. Only an actual answer does this. */
export async function consumeQueryGrant(grantId: string): Promise<void> {
  const db = getDb();
  await db
    .update(queryGrants)
    .set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(eq(queryGrants.id, grantId));
}
