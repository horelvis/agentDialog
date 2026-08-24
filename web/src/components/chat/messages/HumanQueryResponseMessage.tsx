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

/** The typed answer, in the words of its own shape rather than a prose summary. */
function describe(answer: Answer): string {
  switch (answer.kind) {
    case "boolean":
      return answer.value ? "Yes" : "No";
    case "choice":
      return answer.optionIds.join(", ");
    case "scalar":
      return String(answer.value);
    case "date":
      return answer.value;
    case "text":
      return answer.value;
    case "fields":
      return Object.entries(answer.values)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · ");
  }
}

/**
 * An answer to a query. Without this it fell through to the default bubble and
 * showed the server's prose summary, which is a second rendering of something
 * the message already carries in a typed form.
 */
export function HumanQueryResponseMessage({ message }: HumanQueryResponseMessageProps) {
  const data = (message.structuredData ?? {}) as ResponseData;

  if (!data.answer) {
    return <p className="text-sm">{message.content}</p>;
  }

  return (
    <div>
      <p className="text-sm font-medium">{describe(data.answer)}</p>
      {data.comment && <p className="mt-1 text-sm text-gray-300">{data.comment}</p>}
      {data.confidence != null && (
        <p className="mt-1 text-xs text-gray-400">
          Confidence: {Math.round(data.confidence * 100)}%
        </p>
      )}
    </div>
  );
}
