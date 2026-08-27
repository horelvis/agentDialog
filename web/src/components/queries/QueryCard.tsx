import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AnswerSpaceInput, isAnswerComplete } from "@/components/answer/AnswerSpaceInput";
import { QueryContextHeader } from "@/components/queries/QueryContextHeader";
import { InsufficientContextControl } from "@/components/queries/InsufficientContextControl";
import type { Answer, HumanQuery, InsufficientReason, QueryType } from "@/api/types";
import type { RespondInput } from "@/api/queries";

/**
 * The card a human answers a query on. It lives here rather than in a page
 * because the chat is where a query is answered now: a query used to exist
 * twice over, as this card on its own page and as a dead text bubble in the
 * conversation it belongs to. One question, one place to answer it.
 */

const queryTypeBadge = {
  validation: { key: "card.type.validation", color: "bg-blue-600" },
  interpretation: { key: "card.type.interpretation", color: "bg-purple-600" },
  expert_query: { key: "card.type.expert_query", color: "bg-amber-600" },
  labeling: { key: "card.type.labeling", color: "bg-green-600" },
} as const satisfies Record<QueryType, { key: string; color: string }>;

export function QueryCard({
  query,
  onRespond,
}: {
  query: HumanQuery;
  onRespond: (id: string, input: RespondInput) => Promise<void>;
}) {
  const { t } = useTranslation("query");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [comment, setComment] = useState("");
  const [confidence, setConfidence] = useState(0.8);
  const [submitting, setSubmitting] = useState(false);
  const [insufficientSubmitting, setInsufficientSubmitting] = useState(false);

  const badge = queryTypeBadge[query.queryType];
  const expiresIn = Math.max(0, Math.round((new Date(query.expiresAt).getTime() - Date.now()) / 60000));
  const ready = isAnswerComplete(query.answerSpace, answer);

  const handleSubmit = async () => {
    if (!answer || !ready) return;
    setSubmitting(true);
    try {
      await onRespond(query.id, {
        outcome: "answer",
        answer,
        comment: comment.trim() || undefined,
        confidence,
      });
    } catch (e) {
      console.error("[respondQuery]", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInsufficientContext = async (reason: InsufficientReason, note?: string) => {
    setInsufficientSubmitting(true);
    try {
      await onRespond(query.id, { outcome: "insufficient_context", reason, note });
    } catch (e) {
      console.error("[respondQuery]", e);
    } finally {
      setInsufficientSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-surface-border bg-surface-secondary p-5">
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white ${badge.color}`}>
          {t(badge.key)}
        </span>
        <Badge variant="risk" risk={query.risk}>
          {t(`card.risk.${query.risk}`)}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-100">{query.question}</p>
          {query.confidence != null && (
            <p className="mt-1 text-xs text-gray-400">
              {t("card.confidence", { percent: Math.round(query.confidence * 100) })}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">{t("card.expiresIn", { minutes: expiresIn })}</p>
        </div>
      </div>

      <div className="mt-4">
        <QueryContextHeader
          subject={query.subject}
          changes={query.changes}
          priorDecisionAt={query.priorDecisionAt}
        />
      </div>

      {query.context && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-brand-400 hover:text-brand-300">
            {t("card.additionalContext")}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-surface-primary p-3 text-xs text-gray-300">
            {query.context}
          </pre>
        </details>
      )}

      <div className="mt-4 space-y-3">
        <AnswerSpaceInput space={query.answerSpace} value={answer} onChange={setAnswer} />

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">{t("card.commentLabel")}</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("card.commentPlaceholder")}
            className="w-full rounded-lg border border-surface-border bg-surface-primary px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            {t("card.yourConfidence", { percent: Math.round(confidence * 100) })}
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

        <InsufficientContextControl onSubmit={handleInsufficientContext} submitting={insufficientSubmitting} />

        <div className="flex justify-end">
          <Button size="sm" loading={submitting} disabled={!ready} onClick={handleSubmit}>
            {t("card.respond")}
          </Button>
        </div>
      </div>
    </div>
  );
}
