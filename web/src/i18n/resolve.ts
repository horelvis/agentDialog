import { DEFAULT_LANGUAGE, isSupported, narrow, type Language } from "./languages";
import type { StorageLike } from "../lib/storage";

export const LANGUAGE_KEY = "agentdialog:language";

export interface LanguageSources {
  /** What this person chose by hand, on this device. */
  stored?: string | null;
  /** What the agent declared on the query. Only /q/:token has one. */
  declared?: string | null;
  /** navigator.languages, in the browser's own order of preference. */
  navigator?: readonly string[] | null;
}

/**
 * Precedence: chosen > declared > browser > English.
 *
 * The choice comes first because it is the only signal somebody gave on
 * purpose, and it is the safety net for a wrong declaration — which will
 * happen. The declaration beats the browser because the browser belongs to the
 * device: the case that decided this is the shared office computer in English,
 * where the agent knew perfectly well that this person reads Catalan.
 */
export function resolveLanguage(sources: LanguageSources): Language {
  const chosen = narrow(sources.stored);
  if (chosen) return chosen;

  const declared = narrow(sources.declared);
  if (declared) return declared;

  for (const tag of sources.navigator ?? []) {
    const fromBrowser = narrow(tag);
    if (fromBrowser) return fromBrowser;
  }

  return DEFAULT_LANGUAGE;
}

export function readStoredLanguage(storage: StorageLike): Language | null {
  let raw: string | null;
  try {
    raw = storage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
  return isSupported(raw) ? raw : null;
}

export function writeStoredLanguage(storage: StorageLike, language: Language): void {
  try {
    storage.setItem(LANGUAGE_KEY, language);
  } catch {
    // No storage. The choice still holds for this page view, which is the part
    // that matters right now.
  }
}
