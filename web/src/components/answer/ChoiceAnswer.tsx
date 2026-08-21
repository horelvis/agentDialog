import type { AnswerSpace, Answer } from "@/api/types";
import { cn } from "@/lib/cn";

type ChoiceSpace = Extract<AnswerSpace, { kind: "choice" }>;
type ChoiceAnswerValue = Extract<Answer, { kind: "choice" }>;

interface ChoiceAnswerProps {
  space: ChoiceSpace;
  value: ChoiceAnswerValue | null;
  onChange: (value: ChoiceAnswerValue) => void;
}

/**
 * The consequence sits directly under its own option, not in a shared legend
 * above the list — this is the piece the whole typed-query design rests on.
 * Without it, picking an option is a tidy UI over a decision the human still
 * cannot make.
 */
export function ChoiceAnswer({ space, value, onChange }: ChoiceAnswerProps) {
  const selectedIds = new Set(value?.optionIds ?? []);

  const toggle = (id: string) => {
    if (space.select === "one") {
      onChange({ kind: "choice", optionIds: [id] });
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ kind: "choice", optionIds: Array.from(next) });
  };

  return (
    <div className="space-y-2">
      {space.options.map((option) => {
        const selected = selectedIds.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            className={cn(
              "block w-full rounded-lg border p-3 text-left transition-colors",
              selected
                ? "border-brand-500 bg-brand-500/10"
                : "border-surface-border bg-surface-primary hover:bg-surface-elevated",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center border",
                  space.select === "one" ? "rounded-full" : "rounded",
                  selected ? "border-brand-500 bg-brand-500" : "border-surface-border",
                )}
              >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="text-sm font-medium text-gray-100">{option.label}</span>
            </div>
            {option.consequence && (
              <div className="mt-1 pl-6 text-xs text-gray-400">{option.consequence}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
