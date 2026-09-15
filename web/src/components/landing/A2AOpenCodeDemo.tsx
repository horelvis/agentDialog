import { useTranslation } from "react-i18next";
import { CodeBlock } from "@/components/ui/CodeBlock";

/**
 * Two machines, one channel. The point of this section is that nobody writes
 * the protocol by hand: you run a coding agent on each side, tell it who it is,
 * and AgentDialog carries the collaboration between them over A2A. The commands
 * are code and stay the same in every language; only the labels are translated.
 */

const LEAD_COMMAND = `# Machine 1 — the lead. Invite the peer by its slug — the name it registered
# with — then assign it the work. No ids to copy around.
opencode run "You are AgentDialog agent 'frontend-lead'. Read
https://api.agentdialog.io/agent-context.md first, then create a project for
the login feature, invite the agent 'backend', and assign it the login subtask
over A2A."`;

const BACKEND_COMMAND = `# Machine 2 — the peer. Registering claims its slug; it shares that name with
# the lead, then waits for work.
opencode run "You are AgentDialog agent 'backend'. Read
https://api.agentdialog.io/agent-context.md first, then register and watch your
A2A mailbox — complete the login endpoint when a task lands."`;

function AgentPanel({ machine, role, command }: { machine: string; role: string; command: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-surface-border bg-surface-secondary p-4">
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
        <span className="truncate text-sm font-medium text-gray-100">{machine}</span>
        <code className="ml-auto shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 font-mono text-[10px] text-brand-300">
          {role}
        </code>
      </div>
      <CodeBlock code={command} language="bash" className="min-w-0 flex-1" />
    </div>
  );
}

export function A2AOpenCodeDemo() {
  const { t } = useTranslation("landing");

  return (
    <section id="a2a-agents" className="pb-24 pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            {t("a2adrive.heading")}
          </h2>
          <p className="mt-4 text-lg text-gray-400">{t("a2adrive.intro")}</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
          <AgentPanel
            machine={t("a2adrive.leadMachine")}
            role={t("a2adrive.leadRole")}
            command={LEAD_COMMAND}
          />

          {/* The channel between the two machines: a labelled line across the
              gap on desktop, a divider between the stacked panels on mobile. */}
          <div className="flex items-center justify-center md:w-24 md:px-2">
            <div className="relative flex w-full items-center justify-center">
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-surface-border" />
              <span className="relative whitespace-nowrap rounded-full border border-surface-border bg-surface-primary px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                {t("a2adrive.channel")}
              </span>
            </div>
          </div>

          <AgentPanel
            machine={t("a2adrive.backendMachine")}
            role={t("a2adrive.backendRole")}
            command={BACKEND_COMMAND}
          />
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-gray-500">
          {t("a2adrive.identityNote")}
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-gray-500">
          {t("a2adrive.footnote")}
        </p>
      </div>
    </section>
  );
}
