import { useTranslation } from "react-i18next";
import { changeLanguage, useLanguage } from "@/i18n";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isSupported } from "@/i18n/languages";
import { cn } from "@/lib/cn";

/**
 * The same control on the landing page, on the answer page and in the chat.
 *
 * It matters most on /q/:token, which is the one surface where the language was
 * chosen by somebody else — the agent declared it, and agents will get it
 * wrong. This is how that person fixes it without an account.
 *
 * A native <select> on purpose: it is keyboard- and screen-reader-correct for
 * free, and it is what a phone renders as a proper picker.
 */
/**
 * `boxed` is the default and reads as a form control, which is what the footer
 * and the sidebar want. `ghost` drops the frame for the landing's navbar, where
 * the only element that should carry weight is the button beside it.
 */
type Variant = "boxed" | "ghost";

const VARIANTS: Record<Variant, string> = {
  boxed:
    "rounded border border-surface-border bg-surface-secondary px-2 py-1 text-gray-300 hover:text-gray-100 focus:border-brand-600 focus:outline-none",
  ghost:
    "rounded-lg border-none bg-transparent px-2 py-1 text-gray-400 transition-colors hover:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-600",
};

export function LanguageSelector({
  className,
  variant = "boxed",
}: {
  className?: string;
  variant?: Variant;
}) {
  const { t } = useTranslation("common");
  const language = useLanguage();

  return (
    <label className={cn("inline-flex items-center gap-2", className)}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={language}
        onChange={(event) => {
          const next = event.target.value;
          // The choice is deliberate, so it persists — and from here on it
          // outranks anything an agent declares.
          if (isSupported(next)) void changeLanguage(next, { persist: true });
        }}
        className={cn("text-sm", VARIANTS[variant])}
      >
        {SUPPORTED_LANGUAGES.map((option) => (
          <option key={option} value={option}>
            {LANGUAGE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
