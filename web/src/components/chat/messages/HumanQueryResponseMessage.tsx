import type { Answer, Message } from "@/api/types";

interface HumanQueryResponseMessageProps {
  message: Message;
}

interface ResponseData {
  queryId?: string;
  answer?: Answer;
  comment?: string;
  confidence?: number;
}

/**
 * An answer to a query.
 *
 * The label comes from `content`, not from the answer object. The server
 * resolves the answer against the query's answer space when it writes the
 * message — `labels.t` for a boolean, option labels for a choice, the unit for
 * a scalar — and the message does not carry that space, so `content` is the
 * only place the human's own wording survives. Re-deriving it here turns the
 * "Aprobar" they pressed into "Yes", and "8500 EUR" into "8500".
 *
 * `structuredData` is still what carries the comment and the confidence, and
 * the answer object stands in if an older message has no content.
 */
export function HumanQueryResponseMessage({ message }: HumanQueryResponseMessageProps) {
  const data = (message.structuredData ?? {}) as ResponseData;

  const label = message.content?.trim() || fallbackLabel(data.answer);

  return (
    <div>
      {label && <p className="text-sm font-medium">{label}</p>}
      {data.comment && <p className="mt-1 text-sm text-gray-300">{data.comment}</p>}
      {data.confidence != null && (
        <p className="mt-1 text-xs text-gray-400">
          Confidence: {Math.round(data.confidence * 100)}%
        </p>
      )}
    </div>
  );
}

/** Only for a message written without content. Unlabelled by necessity. */
function fallbackLabel(answer: Answer | undefined): string {
  if (!answer) return "";
  switch (answer.kind) {
    case "boolean":
      return answer.value ? "Yes" : "No";
    case "choice":
      return answer.optionIds.join(", ");
    case "scalar":
      return String(answer.value);
    case "date":
    case "text":
      return answer.value;
    case "fields":
      return Object.entries(answer.values)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · ");
  }
}
