/**
 * One rule for "is this the person the thing was addressed to?".
 *
 * It was written out by hand in three places — `respondQuery`,
 * `getQueryForHuman` and `processEmailReply` — and the final review found it
 * missing from a fourth, `acceptInvitation`, which is exactly the failure a
 * scattered rule produces: three careful copies and one gap that lets the
 * whole thing be walked around. Consolidated here so the check is auditable
 * by grepping for one name.
 *
 * Canonicalisation is lowercase + trim, and nothing more. The local part of
 * an address is case-sensitive per RFC 5321, but no mail provider anyone
 * integrates with treats it that way, and matching case-sensitively means a
 * person who capitalises their own address loses access to their own queries.
 * Whatever this function does, `createQuery` must store, or the two sides
 * disagree and the check silently fails open.
 */
export function canonicaliseEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Do these two addresses identify the same person? */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return canonicaliseEmail(a) === canonicaliseEmail(b);
}
