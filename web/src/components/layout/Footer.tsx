import { Logo } from "@/components/ui/Logo";

export function Footer() {
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
          <p className="text-sm text-gray-400">
            Agent-first messaging platform. Built for the AI era.
          </p>
        </div>
      </div>
    </footer>
  );
}
