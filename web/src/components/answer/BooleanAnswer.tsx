import type { AnswerSpace, Answer } from "@/api/types";
import { cn } from "@/lib/cn";

type BooleanSpace = Extract<AnswerSpace, { kind: "boolean" }>;
type BooleanAnswerValue = Extract<Answer, { kind: "boolean" }>;

interface BooleanAnswerProps {
  space: BooleanSpace;
  value: BooleanAnswerValue | null;
  onChange: (value: BooleanAnswerValue) => void;
}

/**
 * Both branches render their consequence, not just the selected one: the
 * human has to weigh them against each other before picking, not read the
 * one they clicked after the fact.
 */
export function BooleanAnswer({ space, value, onChange }: BooleanAnswerProps) {
  const branches: Array<{ v: boolean; label: string; consequence?: string }> = [
    { v: true, label: space.labels.t, consequence: space.consequences?.t },
    { v: false, label: space.labels.f, consequence: space.consequences?.f },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {branches.map((b) => {
        const selected = value?.value === b.v;
        return (
          <button
            key={String(b.v)}
            type="button"
            onClick={() => onChange({ kind: "boolean", value: b.v })}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              selected
                ? "border-brand-500 bg-brand-500/10"
                : "border-surface-border bg-surface-primary hover:bg-surface-elevated",
            )}
          >
            <div className="text-sm font-medium text-gray-100">{b.label}</div>
            {b.consequence && <div className="mt-1 text-xs text-gray-400">{b.consequence}</div>}
          </button>
        );
      })}
    </div>
  );
}
