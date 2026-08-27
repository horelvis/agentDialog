import { describe, expect, test } from "bun:test";
import en from "../../web/src/i18n/catalogues/en";
import es from "../../web/src/i18n/catalogues/es";
import ca from "../../web/src/i18n/catalogues/ca";

/** Every leaf, as a dotted path, so two catalogues can be compared as sets. */
function paths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Every leaf's value, for the emptiness check. */
function leaves(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [value];
  return Object.values(value).flatMap(leaves);
}

/** The leaf a dotted path names, or undefined if the path does not reach one. */
function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null ? (node as Record<string, unknown>)[key] : undefined,
      value,
    );
}

/**
 * The `<tag>`, `</tag>` and `<tag/>` occurrences of a string, in order. These
 * are the component slots <Trans> fills in, so a translation that drops one,
 * adds one or reorders the pair renders something other than what the source
 * says — usually with no error anywhere.
 */
const tagsOf = (s: string): string[] =>
  [...s.matchAll(/<\/?([a-zA-Z0-9_-]+)\s*\/?>/g)].map((m) => m[0]);

/** The names of the `{{…}}` interpolations, as a set. */
const varsOf = (s: string): string[] =>
  [...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();

/** Just the tag names, for the void-element check. */
const tagNamesOf = (s: string): string[] =>
  [...s.matchAll(/<\/?([a-zA-Z0-9_-]+)\s*\/?>/g)].map((m) => m[1].toLowerCase());

/**
 * HTML's void elements. `<Trans>` parses its string with html-parse-stringify,
 * which closes any of these on sight — so a component slot named after one
 * renders as an empty element with its words spilled out beside it, in valid
 * markup, from a key that exists, with a value that is not empty. Nothing else
 * in this file, in eslint or in tsc can see that; this list is why the rule is
 * here rather than in a comment.
 */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const TRANSLATIONS = [
  ["es", es],
  ["ca", ca],
] as const;

/** Every catalogue, for the checks that are about a string in its own right. */
const CATALOGUES = [["en", en], ...TRANSLATIONS] as const;

describe("catalogue parity", () => {
  // With 400 strings per language this is the only thing standing between a
  // half-finished translation and a page that silently falls back to English.
  for (const [name, catalogue] of TRANSLATIONS) {
    test(`${name} has exactly the keys of en`, () => {
      const expected = paths(en).sort();
      const actual = paths(catalogue).sort();

      expect(actual.filter((k) => !expected.includes(k))).toEqual([]); // extra
      expect(expected.filter((k) => !actual.includes(k))).toEqual([]); // missing
    });
  }

  for (const [name, catalogue] of CATALOGUES) {
    test(`${name} has no empty string`, () => {
      const empty = leaves(catalogue).filter((v) => typeof v !== "string" || v.trim() === "");
      expect(empty).toEqual([]);
    });
  }

  // Every namespace, not only `landing`: `query` and `chat` are empty today and
  // will not be tomorrow, and these three checks are the ones a translator most
  // easily breaks.
  const KEYS = paths(en).sort();

  for (const [name, catalogue] of TRANSLATIONS) {
    test(`${name} keeps the markup of every string in en`, () => {
      const wrong = KEYS.flatMap((key) => {
        const source = at(en, key);
        const target = at(catalogue, key);
        if (typeof source !== "string" || typeof target !== "string") return [];

        const expected = tagsOf(source);
        const actual = tagsOf(target);
        if (expected.join("") === actual.join("")) return [];
        return [`${key}: en has ${JSON.stringify(expected)}, ${name} has ${JSON.stringify(actual)}`];
      });

      expect(wrong).toEqual([]);
    });

    test(`${name} keeps the interpolations of every string in en`, () => {
      const wrong = KEYS.flatMap((key) => {
        const source = at(en, key);
        const target = at(catalogue, key);
        if (typeof source !== "string" || typeof target !== "string") return [];

        const expected = varsOf(source);
        const actual = varsOf(target);
        if (expected.join(",") === actual.join(",")) return [];
        return [`${key}: en has ${JSON.stringify(expected)}, ${name} has ${JSON.stringify(actual)}`];
      });

      expect(wrong).toEqual([]);
    });
  }

  for (const [name, catalogue] of CATALOGUES) {
    test(`${name} names no void HTML element as a component`, () => {
      const wrong = paths(catalogue).flatMap((key) => {
        const value = at(catalogue, key);
        if (typeof value !== "string") return [];

        const offenders = [...new Set(tagNamesOf(value))].filter((tag) => VOID_ELEMENTS.has(tag));
        if (offenders.length === 0) return [];
        return [`${key}: <${offenders.join(">, <")}> is a void element and will render empty`];
      });

      expect(wrong).toEqual([]);
    });
  }
});
