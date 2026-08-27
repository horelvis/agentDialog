import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { DEFAULT_LANGUAGE, isSupported, type Language } from "./languages";
import { readStoredLanguage, resolveLanguage, writeStoredLanguage } from "./resolve";
import { persistentStore } from "../lib/storage";
import type en from "./catalogues/en";

/**
 * What makes t("landing:hero.headline") a compile error when the key does not
 * exist. `en` is the source catalogue, so it is also the type.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof en;
  }
}

/**
 * One file per language and namespace, fetched on demand. Vite turns this
 * template into a glob over catalogues/*​/*.ts, so the landing never downloads
 * the chat's strings, nor the two languages it is not painting.
 */
const backend = resourcesToBackend(
  (language: string, namespace: string) => import(`./catalogues/${language}/${namespace}.ts`),
);

/** Called once, before the first render. */
export async function initI18n(): Promise<void> {
  const language = resolveLanguage({
    stored: readStoredLanguage(persistentStore()),
    navigator: navigator.languages,
  });

  await i18next
    .use(backend)
    .use(initReactI18next)
    .init({
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      ns: ["common"],
      defaultNS: "common",
      // React escapes for us; letting i18next do it too double-escapes every
      // apostrophe, and Catalan and Spanish are full of them.
      interpolation: { escapeValue: false },
    });

  applyDocumentLanguage(language);
}

/**
 * `persist` is the whole difference between the two callers. The selector
 * persists — it is a deliberate choice. /q/:token does not: writing the
 * agent's declaration to storage would make it beat every later declaration,
 * forever, from a decision this person never made.
 */
export async function changeLanguage(
  language: Language,
  { persist }: { persist: boolean },
): Promise<void> {
  if (persist) writeStoredLanguage(persistentStore(), language);
  await i18next.changeLanguage(language);
  applyDocumentLanguage(language);
}

function applyDocumentLanguage(language: Language): void {
  document.documentElement.lang = language;
}

/** The active language, for what is not text: dates, numbers, file sizes. */
export function useLanguage(): Language {
  const { i18n } = useTranslation();
  return isSupported(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;
}
