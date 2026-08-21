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
