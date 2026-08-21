import { useState } from "react";
import { INSUFFICIENT_REASONS, type InsufficientReason } from "@/api/types";
import { Button } from "@/components/ui/Button";

// Keyed on InsufficientReason (a Record, not an array) so TypeScript checks
// exhaustiveness: adding a reason to the closed set in api/types.ts without
// giving it copy here is a compile error, not a silently missing radio.
const REASON_COPY: Record<InsufficientReason, { label: string; description: string }> = {
  unknown_subject: {
    label: "I don't know what this is about",
    description: "The subject isn't something I recognize.",
  },
  missing_delta: {
    label: "I don't know what changed",
    description: "This references a prior decision but doesn't say what's different now.",
  },
  unclear_consequences: {
    label: "I don't know what happens if I answer",
    description: "What each option leads to isn't clear to me.",
  },
  referent_unreachable: {
    label: "I can't reach what's being referenced",
    description: "The link, attachment or file isn't accessible to me.",
  },
  not_my_decision: {
    label: "This isn't my decision to make",
    description: "Someone else should be answering this.",
  },
};

const REASONS = INSUFFICIENT_REASONS.map((id) => ({ id, ...REASON_COPY[id] }));

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
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<InsufficientReason | null>(null);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-500 hover:text-gray-300">
        I don't have enough context to answer this
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-surface-border bg-surface-primary p-3">
      <p className="text-xs font-medium text-gray-300">What's missing?</p>
      <div className="space-y-1.5">
        {REASONS.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-surface-elevated">
            <input
              type="radio"
              name="insufficient-reason"
              checked={reason === r.id}
              onChange={() => setReason(r.id)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm text-gray-200">{r.label}</span>
              <span className="block text-xs text-gray-500">{r.description}</span>
            </span>
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything else the agent should know? (optional)"
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
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!reason}
          loading={submitting}
          onClick={() => reason && onSubmit(reason, note.trim() || undefined)}
        >
          Send back to the agent
        </Button>
      </div>
    </div>
  );
}
