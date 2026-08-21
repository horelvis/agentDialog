import type { AnswerSpace, Answer } from "@/api/types";
import { BooleanAnswer } from "./BooleanAnswer";
import { ChoiceAnswer } from "./ChoiceAnswer";
import { ScalarAnswer } from "./ScalarAnswer";
import { DateAnswer } from "./DateAnswer";
import { TextAnswer } from "./TextAnswer";
import { FieldsAnswer } from "./FieldsAnswer";

interface AnswerSpaceInputProps {
  space: AnswerSpace;
  value: Answer | null;
  onChange: (value: Answer | null) => void;
}

/** Dispatches to one renderer per answer shape, by `space.kind`. */
export function AnswerSpaceInput({ space, value, onChange }: AnswerSpaceInputProps) {
  switch (space.kind) {
    case "boolean":
      return (
        <BooleanAnswer space={space} value={value?.kind === "boolean" ? value : null} onChange={onChange} />
      );
    case "choice":
      return (
        <ChoiceAnswer space={space} value={value?.kind === "choice" ? value : null} onChange={onChange} />
      );
    case "scalar":
      return (
        <ScalarAnswer space={space} value={value?.kind === "scalar" ? value : null} onChange={onChange} />
      );
    case "date":
      return <DateAnswer space={space} value={value?.kind === "date" ? value : null} onChange={onChange} />;
    case "text":
      return <TextAnswer space={space} value={value?.kind === "text" ? value : null} onChange={onChange} />;
    case "fields":
      return (
        <FieldsAnswer space={space} value={value?.kind === "fields" ? value : null} onChange={onChange} />
      );
    default:
      // The catalogue is closed and the server enforces it, so this is only
      // reachable if a newer API adds a shape this build has never heard of.
      // Falling through to `undefined` would render nothing at all: the human
      // would see a question with no way to answer it and no reason why, on
      // the one surface with no automated tests to catch it.
      return (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          This question asks for an answer of a kind this app doesn&apos;t recognise
          ({String((space as { kind?: unknown }).kind)}). Reload to pick up the
          latest version; if it persists, the agent needs to ask again in a shape
          this app supports.
        </p>
      );
  }
}

/**
 * Client-side readiness check, for the Respond button only — it never
 * substitutes for the server's own `validateAnswerAgainstSpace`, which is
 * what actually decides whether an answer fits.
 */
export function isAnswerComplete(space: AnswerSpace, answer: Answer | null): boolean {
  if (!answer || answer.kind !== space.kind) return false;

  switch (answer.kind) {
    case "boolean":
      return true;
    case "choice":
      return answer.optionIds.length > 0;
    case "scalar":
      return Number.isFinite(answer.value);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(answer.value);
    case "text":
      return answer.value.trim().length > 0;
    case "fields":
      return (
        space.kind === "fields" &&
        space.fields.every((f) => {
          const v = answer.values[f.id];
          return v !== undefined && v !== null && v !== "";
        })
      );
  }
}
