import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("query");

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
          {t("answer.unsupportedKind", { kind: String((space as { kind?: unknown }).kind) })}
        </p>
      );
  }
}
