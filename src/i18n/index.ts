import { SUPPORTED_LANGUAGES, type Language, type Messages } from "./types";
import { en } from "./en";
import { es } from "./es";
import { ca } from "./ca";

export { SUPPORTED_LANGUAGES, type Language, type Messages };

const CATALOGUES: Record<Language, Messages> = { en, es, ca };

const LOCALE_TAGS: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
  ca: "ca-ES",
};

function isSupported(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Anything unknown falls back to English rather than throwing: a row written
 *  before the column existed must not be able to break an email. */
export function messagesFor(language: string): Messages {
  return isSupported(language) ? CATALOGUES[language] : CATALOGUES.en;
}

/** Takes a string for the same reason messagesFor does: the value arrives from
 *  a database column, not from a narrowed type. */
export function localeTag(language: string): string {
  return isSupported(language) ? LOCALE_TAGS[language] : LOCALE_TAGS.en;
}

/**
 * The browser's own preference order, narrowed to what we have. Region is
 * dropped: ca-ES is Catalan, es-MX is Spanish.
 */
export function negotiateLanguage(header: string | undefined): Language {
  if (!header) return "en";

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase().split("-")[0]!, weight: q ? Number(q) : 1 };
    })
    .filter((c) => c.tag.length > 0)
    .sort((a, b) => b.weight - a.weight);

  for (const candidate of candidates) {
    if (isSupported(candidate.tag)) return candidate.tag;
  }
  return "en";
}
