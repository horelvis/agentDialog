import { describe, expect, it } from "bun:test";
import { subjectSchema } from "../../src/validators/query.validators";
import { isHttpUrl } from "../../src/lib/url";
// The web app's own copy, imported directly rather than mirrored: this is
// the exact predicate QueryContextHeader calls before it renders an anchor.
import { isHttpUrl as isHttpUrlInWeb } from "../../web/src/lib/url";

/**
 * A `subject.uri` becomes an `href` in the approver's session — the session
 * that holds their token. `z.string().url()` on its own accepts
 * `javascript:alert(1)` and `data:text/html,…`, so both layers are checked:
 * the validator refuses to store one, and the renderer refuses to link one
 * that is already stored.
 */

const HOSTILE = [
  "javascript:alert(1)",
  "JavaScript:alert(document.cookie)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
];

const HARMLESS = [
  "https://example.test/contracts/42",
  "http://example.test/contracts/42",
];

describe("layer 1 — the validator, protecting what comes in", () => {
  it("refuses a subject whose uri is not http(s)", () => {
    for (const uri of HOSTILE) {
      const parsed = subjectSchema.safeParse({ id: "a", label: "A", uri });
      expect(parsed.success).toBe(false);
    }
  });

  it("still accepts an ordinary http(s) uri", () => {
    for (const uri of HARMLESS) {
      const parsed = subjectSchema.safeParse({ id: "a", label: "A", uri });
      expect(parsed.success).toBe(true);
    }
  });

  it("still accepts a subject with no uri at all", () => {
    expect(subjectSchema.safeParse({ id: "a", label: "A", body: "x" }).success).toBe(true);
  });
});

describe("layer 2 — the render check, protecting rows already stored", () => {
  it("refuses to linkify a scheme that is not http(s)", () => {
    for (const uri of HOSTILE) {
      expect(isHttpUrl(uri)).toBe(false);
      expect(isHttpUrlInWeb(uri)).toBe(false);
    }
  });

  it("linkifies an ordinary http(s) uri", () => {
    for (const uri of HARMLESS) {
      expect(isHttpUrl(uri)).toBe(true);
      expect(isHttpUrlInWeb(uri)).toBe(true);
    }
  });

  it("treats an absent or unparseable uri as not linkable", () => {
    expect(isHttpUrlInWeb(undefined)).toBe(false);
    expect(isHttpUrlInWeb(null)).toBe(false);
    expect(isHttpUrlInWeb("not a url at all")).toBe(false);
    expect(isHttpUrl("not a url at all")).toBe(false);
  });
});
