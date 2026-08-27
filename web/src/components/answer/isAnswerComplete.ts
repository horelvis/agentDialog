import type { AnswerSpace, Answer } from "@/api/types";

/**
 * Client-side readiness check, for the Respond button only — it never
 * substitutes for the server's own `validateAnswerAgainstSpace`, which is
 * what actually decides whether an answer fits.
 *
 * Its own module rather than living in AnswerSpaceInput.tsx: a file with a
 * non-component export alongside a component export breaks Vite's fast
 * refresh, forcing a full reload on every edit to either.
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
