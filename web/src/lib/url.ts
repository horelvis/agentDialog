/**
 * Is this a URL we are willing to put behind an `href`?
 *
 * The server's `subjectSchema` already narrows `subject.uri` to http/https,
 * but that only protects rows written after the rule existed. This is the
 * second layer: a row stored before it — or reached through any surface that
 * did not go through the validator — must still not turn into a
 * `javascript:` or `data:` link inside the session that holds the human's
 * token. Mirrors `src/lib/url.ts` on the server.
 */
export function isHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
