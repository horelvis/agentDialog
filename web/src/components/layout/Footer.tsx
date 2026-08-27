import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { Logo } from "@/components/ui/Logo";

interface FooterProps {
  /**
   * Drop the outbound links. Set on the page where somebody answers a question
   * from an email link: every link there is an invitation to abandon the one
   * decision the page exists for. The landing page still wants them.
   */
  minimal?: boolean;
}

export function Footer({ minimal = false }: FooterProps) {
  // `common`, not `landing`: this component also mounts on /q/:token in
  // minimal mode, and that page shouldn't download the landing's whole
  // catalogue for three strings it mostly hides.
  const { t } = useTranslation("common");

  return (
    <footer className="border-t border-surface-border bg-surface-secondary">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-600 p-0.5 text-white">
              <Logo className="h-full w-full" />
            </div>
            {/* The product's name, the same in every language. */}
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span className="text-sm font-semibold text-gray-100">AgentDialog</span>
          </div>
          <div className="flex items-center gap-6">
            {/* Only in minimal mode, which is the inverse of everything else
                this flag governs — and deliberately so. Minimal means
                /q/:token, the page reached from an email, which has no navbar
                and is the one surface where the language was chosen by
                somebody else: the agent declared it, and agents get it wrong.
                Without this the reader has no way to correct it.

                The landing has the picker in its navbar instead, so repeating
                it here would be two controls for one setting. */}
            {minimal && <LanguageSelector />}
            <p className="text-sm text-gray-400">{t("footer.tagline")}</p>
            {!minimal && (
              <>
                <a
                  href="https://github.com/horelvis/agentDialog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200"
                >
                  {t("footer.github")}
                </a>
                <a
                  href="https://docs.agentdialog.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200"
                >
                  {t("footer.docs")}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
