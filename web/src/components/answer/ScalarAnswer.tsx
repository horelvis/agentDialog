import type { AnswerSpace, Answer } from "@/api/types";

type ScalarSpace = Extract<AnswerSpace, { kind: "scalar" }>;
type ScalarAnswerValue = Extract<Answer, { kind: "scalar" }>;

interface ScalarAnswerProps {
  space: ScalarSpace;
  value: ScalarAnswerValue | null;
  onChange: (value: ScalarAnswerValue | null) => void;
}

export function ScalarAnswer({ space, value, onChange }: ScalarAnswerProps) {
  const range =
    space.min !== undefined && space.max !== undefined
      ? `Between ${space.min} and ${space.max} ${space.unit}`
      : space.min !== undefined
        ? `At least ${space.min} ${space.unit}`
        : space.max !== undefined
          ? `At most ${space.max} ${space.unit}`
          : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={space.min}
          max={space.max}
          step={space.step ?? "any"}
          value={value?.value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? null : { kind: "scalar", value: Number(raw) });
          }}
          className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
        />
        <span className="text-sm text-gray-400">{space.unit}</span>
      </div>
      {range && <p className="text-xs text-gray-500">{range}</p>}
      {space.effect && <p className="text-xs text-gray-400">{space.effect}</p>}
    </div>
  );
}
