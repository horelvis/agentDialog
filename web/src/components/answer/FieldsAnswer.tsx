import { useEffect, useState } from "react";
import type { AnswerSpace, Answer, AnswerSlot } from "@/api/types";
import { cn } from "@/lib/cn";

type FieldsSpace = Extract<AnswerSpace, { kind: "fields" }>;
type FieldsAnswerValue = Extract<Answer, { kind: "fields" }>;

interface FieldsAnswerProps {
  space: FieldsSpace;
  value: FieldsAnswerValue | null;
  onChange: (value: FieldsAnswerValue) => void;
}

function proposedValues(fields: AnswerSlot[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.proposed !== undefined) values[f.id] = f.proposed;
  }
  return values;
}

/**
 * Every slot starts filled with its `proposed` value, and a slot the human
 * never touches still submits with what was proposed — a receipt whose
 * amount is already right should not require re-typing it. Touching one
 * marks it "corrected" so it stands out from what came pre-filled.
 */
export function FieldsAnswer({ space, value, onChange }: FieldsAnswerProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => value?.values ?? proposedValues(space.fields),
  );
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!value) onChange({ kind: "fields", values });
    // Only on mount: publishes the pre-filled defaults so a fully-proposed
    // form is submittable without the human touching anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (id: string, v: unknown) => {
    const next = { ...values, [id]: v };
    setValues(next);
    setTouched((t) => new Set(t).add(id));
    onChange({ kind: "fields", values: next });
  };

  return (
    <div className="space-y-3">
      {space.effect && <p className="text-xs text-gray-400">{space.effect}</p>}
      {space.fields.map((field) => {
        const isTouched = touched.has(field.id);
        const wasProposed = field.proposed !== undefined;
        return (
          <div key={field.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-400">{field.label}</label>
              {wasProposed && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    isTouched ? "bg-amber-500/20 text-amber-400" : "bg-surface-tertiary text-gray-500",
                  )}
                >
                  {isTouched ? "corrected" : "proposed"}
                </span>
              )}
            </div>
            <FieldSlotInput field={field} value={values[field.id]} onChange={(v) => setField(field.id, v)} />
          </div>
        );
      })}
    </div>
  );
}

function FieldSlotInput({
  field,
  value,
  onChange,
}: {
  field: AnswerSlot;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.kind) {
    case "boolean":
      return (
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: true, label: field.labels.t },
            { v: false, label: field.labels.f },
          ].map((b) => (
            <button
              key={String(b.v)}
              type="button"
              onClick={() => onChange(b.v)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                value === b.v
                  ? "border-brand-500 bg-brand-500/10 text-gray-100"
                  : "border-surface-border bg-surface-primary text-gray-300 hover:bg-surface-elevated",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      );

    case "choice":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
        >
          <option value="" disabled>
            Select…
          </option>
          {field.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case "scalar":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? "any"}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
          />
          <span className="text-sm text-gray-400">{field.unit}</span>
        </div>
      );

    case "date":
      return (
        <input
          type="date"
          min={field.earliest}
          max={field.latest}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
        />
      );

    case "text":
      return (
        <input
          type="text"
          maxLength={field.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
        />
      );
  }
}
