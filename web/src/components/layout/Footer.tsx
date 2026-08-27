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
  return (
    <footer className="border-t border-surface-border bg-surface-secondary">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-600 p-0.5 text-white">
              <Logo className="h-full w-full" />
            </div>
            <span className="text-sm font-semibold text-gray-100">AgentDialog</span>
          </div>
          <div className="flex items-center gap-6">
            {/* Kept in minimal mode. That flag drops links which invite
                somebody away from the one decision the page exists for; a
                language picker does the opposite — it is what lets them read
                the decision at all. */}
            <LanguageSelector />
            <p className="text-sm text-gray-400">
              Agent-first messaging platform. Built for the AI era.
            </p>
            {!minimal && (
              <>
                <a
                  href="https://github.com/horelvis/agentDialog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200"
                >
                  GitHub
                </a>
                <a
                  href="https://docs.agentdialog.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200"
                >
                  Docs
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
