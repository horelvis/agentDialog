import { useState } from "react";
import type { QuerySubject, QueryChange } from "@/api/types";
import { isHttpUrl } from "@/lib/url";
import { cn } from "@/lib/cn";

interface QueryContextHeaderProps {
  subject: QuerySubject;
  changes: QueryChange[] | null;
  priorDecisionAt: string | null;
}

/**
 * What a human needs before they can decide: what this is, what it points
 * at, and — if it renews a prior decision — what changed since then, with
 * the material changes called out from the merely cosmetic ones.
 */
export function QueryContextHeader({ subject, changes, priorDecisionAt }: QueryContextHeaderProps) {
  return (
    <div className="space-y-3 rounded-lg border border-surface-border bg-surface-primary p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">About</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-100">{subject.label}</p>
      </div>

      {priorDecisionAt && (
        <p className="text-xs text-amber-400">
          You decided about this on {new Date(priorDecisionAt).toLocaleDateString()}.
        </p>
      )}

      <Referent subject={subject} />

      {changes && changes.length > 0 && <ChangesTable changes={changes} />}
    </div>
  );
}

function Referent({ subject }: { subject: QuerySubject }) {
  const [showBody, setShowBody] = useState(false);

  // Checked again here, not just at the door. The validator narrows `uri` to
  // http/https on the way in, but a row written before that rule existed can
  // still carry `javascript:` or `data:` — and this anchor lives in the app
  // where the human's session token does.
  const linkable = isHttpUrl(subject.uri);
  const hasAny = linkable || Boolean(subject.body);

  if (!hasAny) {
    // Either the query really is self-contained, or its `uri` was refused
    // above. Saying so is better than rendering a dead link.
    return <p className="text-xs text-gray-500">Self-contained — nothing else to look at.</p>;
  }

  return (
    <div className="space-y-2">
      {linkable && (
        <a
          href={subject.uri}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
        >
          Open referenced link &#8599;
        </a>
      )}

      {subject.body && (
        <div>
          <button
            type="button"
            onClick={() => setShowBody((s) => !s)}
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            {showBody ? "Hide referent" : "Show referent"}
          </button>
          {showBody && (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-surface-secondary p-3 text-xs text-gray-300">
              {subject.body}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ChangesTable({ changes }: { changes: QueryChange[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">What changed</p>
      <div className="mt-1 space-y-1">
        {changes.map((c, i) => (
          <div
            key={`${c.path}-${i}`}
            className={cn(
              "rounded border px-2 py-1.5 text-xs",
              c.materiality === "material"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-surface-border bg-surface-secondary",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-gray-200">{c.path}</span>
              {c.materiality === "material" && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                  material
                </span>
              )}
            </div>
            <div className="mt-0.5 text-gray-400">
              <span className="opacity-70 line-through">{c.before}</span>
              {" → "}
              <span className="text-gray-200">{c.after}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
