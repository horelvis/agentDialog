import type { AnswerSpace, Answer } from "@/api/types";

type DateSpace = Extract<AnswerSpace, { kind: "date" }>;
type DateAnswerValue = Extract<Answer, { kind: "date" }>;

interface DateAnswerProps {
  space: DateSpace;
  value: DateAnswerValue | null;
  onChange: (value: DateAnswerValue | null) => void;
}

export function DateAnswer({ space, value, onChange }: DateAnswerProps) {
  return (
    <div className="space-y-1">
      <input
        type="date"
        min={space.earliest}
        max={space.latest}
        value={value?.value ?? ""}
        onChange={(e) => onChange(e.target.value ? { kind: "date", value: e.target.value } : null)}
        className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
      />
      {space.effect && <p className="text-xs text-gray-400">{space.effect}</p>}
    </div>
  );
}
