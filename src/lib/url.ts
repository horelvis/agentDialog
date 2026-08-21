/**
 * Is this a URL we are willing to put behind an `href`?
 *
 * `z.string().url()` accepts any parseable URL, which includes
 * `javascript:alert(1)` and `data:text/html,…`. A subject's `uri` is rendered
 * as a link inside the approver's own session — the session that holds their
 * token — so the scheme has to be narrowed to the two that only ever navigate.
 *
 * Kept here rather than inline in the validator because the render side needs
 * the same rule: the validator protects what comes in, and the check at render
 * time protects rows that were stored before this rule existed.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
