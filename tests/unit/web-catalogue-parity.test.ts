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

const TRANSLATIONS = [
  ["es", es],
  ["ca", ca],
] as const;

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

  for (const [name, catalogue] of [["en", en], ...TRANSLATIONS] as const) {
    test(`${name} has no empty string`, () => {
      const empty = leaves(catalogue).filter((v) => typeof v !== "string" || v.trim() === "");
      expect(empty).toEqual([]);
    });
  }
});
