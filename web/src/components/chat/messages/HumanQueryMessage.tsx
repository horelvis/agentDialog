import type { Message } from "@/api/types";
import { QueryCard } from "@/components/queries/QueryCard";
import { useQueryStore } from "@/stores/queryStore";

interface HumanQueryMessageProps {
  message: Message;
}

/**
 * A query, rendered where it was asked.
 *
 * It used to fall through MessageRenderer's default and appear as a plain
 * text bubble: the question with no answer space, no consequences and nothing
 * to press, while the only usable copy lived on a separate page. Two channels
 * for one question.
 *
 * The store only holds queries still open — pending, assigned or
 * needs_context — so a query that has been answered, cancelled or expired
 * finds nothing here and renders as the question it was. Its answer arrives
 * as its own human_query_response message.
 */
export function HumanQueryMessage({ message }: HumanQueryMessageProps) {
  const query = useQueryStore((s) =>
    s.queries.find((q) => q.queryMessageId === message.id),
  );
  const respond = useQueryStore((s) => s.respond);

  if (!query) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Question
        </p>
        <p className="mt-1 text-sm text-gray-200">{message.content}</p>
      </div>
    );
  }

  return <QueryCard query={query} onRespond={respond} />;
}
