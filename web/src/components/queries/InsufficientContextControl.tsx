import { useState } from "react";
import { useTranslation } from "react-i18next";
import { INSUFFICIENT_REASONS, type InsufficientReason } from "@/api/types";
import { Button } from "@/components/ui/Button";

interface InsufficientContextControlProps {
  onSubmit: (reason: InsufficientReason, note?: string) => Promise<void>;
  submitting: boolean;
}

/**
 * The third answer to a query, alongside actually answering it: the human
 * says why they cannot decide, from a closed set of reasons the agent can
 * act on. Submitting hands the turn back to the agent instead of leaving
 * the human to rubber-stamp something they cannot evaluate.
 */
export function InsufficientContextControl({ onSubmit, submitting }: InsufficientContextControlProps) {
  const { t } = useTranslation("query");
  const { t: tCommon } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<InsufficientReason | null>(null);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-500 hover:text-gray-300">
        {t("answer.insufficient.trigger")}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-surface-border bg-surface-primary p-3">
      <p className="text-xs font-medium text-gray-300">{t("answer.insufficient.heading")}</p>
      <div className="space-y-1.5">
        {INSUFFICIENT_REASONS.map((id) => (
          <label key={id} className="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-surface-elevated">
            <input
              type="radio"
              name="insufficient-reason"
              checked={reason === id}
              onChange={() => setReason(id)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm text-gray-200">{t(`answer.insufficient.reasons.${id}.label`)}</span>
              <span className="block text-xs text-gray-500">
                {t(`answer.insufficient.reasons.${id}.description`)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("answer.insufficient.notePlaceholder")}
        rows={2}
        className="w-full rounded-lg border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-500 focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setReason(null);
            setNote("");
          }}
        >
          {tCommon("action.cancel")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!reason}
          loading={submitting}
          onClick={() => reason && onSubmit(reason, note.trim() || undefined)}
        >
          {t("answer.insufficient.submit")}
        </Button>
      </div>
    </div>
  );
}
