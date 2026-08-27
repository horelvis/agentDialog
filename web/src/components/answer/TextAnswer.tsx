import { useTranslation } from "react-i18next";
import type { AnswerSpace, Answer } from "@/api/types";

type TextSpace = Extract<AnswerSpace, { kind: "text" }>;
type TextAnswerValue = Extract<Answer, { kind: "text" }>;

interface TextAnswerProps {
  space: TextSpace;
  value: TextAnswerValue | null;
  onChange: (value: TextAnswerValue | null) => void;
}

export function TextAnswer({ space, value, onChange }: TextAnswerProps) {
  const { t } = useTranslation("query");
  const text = value?.value ?? "";
  return (
    <div className="space-y-1">
      <textarea
        value={text}
        maxLength={space.maxLength}
        onChange={(e) => onChange(e.target.value ? { kind: "text", value: e.target.value } : null)}
        placeholder={t("answer.text.placeholder")}
        rows={4}
        className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
      />
      <p className="text-right text-xs text-gray-500">
        {text.length} / {space.maxLength}
      </p>
    </div>
  );
}
