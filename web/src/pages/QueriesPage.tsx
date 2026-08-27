import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useQueryStore } from "@/stores/queryStore";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/hooks/useNow";
import type { HumanQuery, QueryType } from "@/api/types";

/**
 * An index, not a second place to answer.
 *
 * A query used to exist twice over: as a card here, and as a dead text bubble
 * in the conversation it belongs to. Two channels for one question, and only
 * one of them could actually answer it. Answering now happens in the chat,
 * where the question was asked; this page exists because a human with queries
 * across several conversations still needs somewhere to see them together.
 */

// Colors only — the words come from QueryCard's own `query:card.type.*` keys,
// so a query type reads the same badge wherever it's answered from.
const queryTypeColor: Record<QueryType, string> = {
  validation: "bg-blue-600",
  interpretation: "bg-purple-600",
  expert_query: "bg-amber-600",
  labeling: "bg-green-600",
};

function QueryRow({ query }: { query: HumanQuery }) {
  const { t } = useTranslation("chat");
  const { t: tQuery } = useTranslation("query");
  const now = useNow();
  const expiresIn =
    now == null
      ? null
      : Math.max(0, Math.round((new Date(query.expiresAt).getTime() - now) / 60000));

  return (
    <Link
      to={`/app/c/${query.conversationId}`}
      className="block rounded-lg border border-surface-border bg-surface-secondary p-4 transition-colors hover:border-brand-500"
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium text-white ${queryTypeColor[query.queryType]}`}
        >
          {tQuery(`card.type.${query.queryType}`)}
        </span>
        <Badge variant="risk" risk={query.risk}>
          {tQuery(`card.risk.${query.risk}`)}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-100">{query.question}</p>
          <p className="mt-1 text-xs text-gray-500">
            {query.status === "needs_context"
              ? t("queries.waitingOnAgent")
              : expiresIn != null && tQuery("card.expiresIn", { minutes: expiresIn })}
          </p>
        </div>
        <span className="shrink-0 self-center text-xs text-brand-400">{t("queries.answerCta")}</span>
      </div>
    </Link>
  );
}

export function QueriesPage() {
  const { t } = useTranslation("chat");
  const { queries, loading, fetchQueries } = useQueryStore();

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-surface-border bg-surface-secondary px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-100">{t("queries.title")}</h1>
        <p className="text-sm text-gray-400">{t("queries.body")}</p>
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
            <p>{t("queries.emptyTitle")}</p>
            <p className="mt-1 text-sm">{t("queries.emptyBody")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((query) => (
              <QueryRow key={query.id} query={query} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
