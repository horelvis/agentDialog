/**
 * The closed catalogue. Adding a language means adding a value here and four
 * files of messages — that cost is the point: supporting a language means
 * having it written and reviewed by somebody who speaks it.
 */
export const SUPPORTED_LANGUAGES = ["en", "es", "ca"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

export const NAMESPACES = ["common", "landing", "query", "chat"] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** What Intl gets handed. Mirrors LOCALE_TAGS in src/i18n/index.ts. */
const LOCALE_TAGS: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
  ca: "ca-ES",
};

/**
 * Autonyms: a language names itself the same way whatever the interface is set
 * to, so these are never translated and never live in a catalogue.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
  ca: "Català",
};

export function isSupported(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function localeTag(language: Language): string {
  return LOCALE_TAGS[language];
}

/**
 * A BCP-47 tag narrowed to what we can render, or null. Region is dropped —
 * ca-ES is Catalan and es-MX is Spanish — and anything outside the catalogue
 * is null rather than English, so the caller can try its next source instead
 * of stopping here.
 */
export function narrow(tag: string | null | undefined): Language | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split("-")[0];
  return isSupported(base) ? base : null;
}
