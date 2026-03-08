import { useEffect, useState } from "react";
import { useQueryStore } from "@/stores/queryStore";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { HumanQuery, QueryType } from "@/api/types";

const queryTypeBadge: Record<QueryType, { label: string; color: string }> = {
  validation: { label: "Validation", color: "bg-blue-600" },
  interpretation: { label: "Interpretation", color: "bg-purple-600" },
  expert_query: { label: "Expert", color: "bg-amber-600" },
  labeling: { label: "Labeling", color: "bg-green-600" },
};

function QueryCard({
  query,
  onRespond,
}: {
  query: HumanQuery;
  onRespond: (id: string, input: { answer: string; comment?: string; confidence?: number }) => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [comment, setComment] = useState("");
  const [confidence, setConfidence] = useState(0.8);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const badge = queryTypeBadge[query.queryType];
  const expiresIn = Math.max(0, Math.round((new Date(query.expiresAt).getTime() - Date.now()) / 60000));

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      await onRespond(query.id, {
        answer: answer.trim(),
        comment: comment.trim() || undefined,
        confidence,
      });
    } catch (e) {
      console.error("[respondQuery]", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-surface-border bg-surface-secondary p-5">
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white ${badge.color}`}>
          {badge.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-100">{query.question}</p>
          {query.confidence != null && (
            <p className="mt-1 text-xs text-gray-400">
              Agent confidence: {Math.round(query.confidence * 100)}%
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Expires in {expiresIn} min
          </p>
        </div>
      </div>

      {query.context && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            {expanded ? "Hide context" : "Show context"}
          </button>
          {expanded && (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-primary p-3 text-xs text-gray-300">
              {query.context}
            </pre>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Answer</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            rows={3}
            className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Comment (optional)</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Additional notes..."
            className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Confidence: {Math.round(confidence * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            className="w-full accent-brand-500"
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            loading={submitting}
            disabled={!answer.trim()}
            onClick={handleSubmit}
          >
            Respond
          </Button>
        </div>
      </div>
    </div>
  );
}

export function QueriesPage() {
  const { queries, loading, fetchQueries, respond } = useQueryStore();

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-surface-border bg-surface-secondary px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-100">Queries</h1>
        <p className="text-sm text-gray-400">
          Questions from agents that need your response.
        </p>
      </header>
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : queries.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <svg className="mx-auto mb-3 h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No pending queries.</p>
            <p className="mt-1 text-sm">When agents send you questions, they'll appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {queries.map((query) => (
              <QueryCard key={query.id} query={query} onRespond={respond} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
