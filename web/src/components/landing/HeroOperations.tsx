import { useTranslation } from "react-i18next";

/**
 * The two operations, drawn side by side so neither can be mistaken for the
 * other: A2H — an agent steps out to a person and the answer comes back — and
 * A2A — a lead splits a task between peers who deliver back. The same diagram
 * family as FlowDemo and A2AFlowDemo, reduced to a card each.
 */

function AgentNode({
  cx,
  cy,
  label,
  accent = "brand",
}: {
  cx: number;
  cy: number;
  label: string;
  accent?: "brand" | "emerald";
}) {
  const fill = accent === "brand" ? "var(--color-brand-500)" : "#34d399";
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill={fill} />
      <text
        x={cx}
        y={cy + 26}
        textAnchor="middle"
        className="fill-gray-500 font-mono text-[7px] uppercase tracking-wide"
      >
        {label}
      </text>
    </g>
  );
}

function LiveEdge({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--color-brand-400)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeDasharray="4 3"
      className="animate-[edge-flow_0.9s_linear_infinite]"
    />
  );
}

function ReturnEdge({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--color-brand-700)"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
}

function OperationCard({
  id,
  title,
  caption,
  diagram,
}: {
  id: "a2h" | "a2a";
  title: string;
  caption: string;
  diagram: React.ReactNode;
}) {
  const { t } = useTranslation("landing");
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-secondary p-6">
      <div className="flex items-center gap-2">
        <code className="font-mono text-sm font-semibold text-brand-300">{id.toUpperCase()}</code>
        <span className="text-base font-semibold text-gray-100">{title}</span>
      </div>
      <div className="mt-3">{diagram}</div>
      <p className="mt-3 text-sm leading-snug text-gray-400">{caption}</p>
      <p className="mt-2 text-[11px] text-gray-600">{t(`hero.operations.${id}.tagline`)}</p>
    </div>
  );
}

export function HeroOperations() {
  const { t } = useTranslation("landing");

  return (
    <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
      <OperationCard
        id="a2h"
        title={t("hero.operations.a2h.title")}
        caption={t("hero.operations.a2h.caption")}
        diagram={
          <svg viewBox="0 0 140 80" className="h-24 w-full" aria-hidden="true">
            <LiveEdge d="M 38 33 C 70 20 90 20 102 33" />
            <ReturnEdge d="M 102 47 C 70 60 50 60 38 47" />
            <AgentNode cx={24} cy={40} label={t("hero.operations.a2h.agent")} />
            <AgentNode cx={116} cy={40} label={t("hero.operations.a2h.human")} accent="emerald" />
          </svg>
        }
      />

      <OperationCard
        id="a2a"
        title={t("hero.operations.a2a.title")}
        caption={t("hero.operations.a2a.caption")}
        diagram={
          <svg viewBox="0 0 140 80" className="h-24 w-full" aria-hidden="true">
            <LiveEdge d="M 62 26 C 45 38 30 45 26 52" />
            <LiveEdge d="M 78 26 C 95 38 110 45 114 52" />
            <ReturnEdge d="M 30 58 C 40 46 55 38 64 26" />
            <ReturnEdge d="M 110 58 C 100 46 85 38 76 26" />
            <AgentNode cx={70} cy={18} label={t("hero.operations.a2a.lead")} />
            <AgentNode cx={22} cy={62} label={t("hero.operations.a2a.peerA")} />
            <AgentNode cx={118} cy={62} label={t("hero.operations.a2a.peerB")} />
          </svg>
        }
      />
    </div>
  );
}