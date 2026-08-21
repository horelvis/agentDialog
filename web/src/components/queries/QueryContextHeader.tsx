import { useEffect, useState } from "react";
import type { QuerySubject, QueryChange } from "@/api/types";
import { API_BASE } from "@/lib/constants";
import { cn } from "@/lib/cn";

interface QueryContextHeaderProps {
  subject: QuerySubject;
  changes: QueryChange[] | null;
  priorDecisionAt: string | null;
  conversationId: string;
}

/**
 * What a human needs before they can decide: what this is, what it points
 * at, and — if it renews a prior decision — what changed since then, with
 * the material changes called out from the merely cosmetic ones.
 */
export function QueryContextHeader({ subject, changes, priorDecisionAt, conversationId }: QueryContextHeaderProps) {
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

      <Referent subject={subject} conversationId={conversationId} />

      {changes && changes.length > 0 && <ChangesTable changes={changes} />}
    </div>
  );
}

function Referent({ subject, conversationId }: { subject: QuerySubject; conversationId: string }) {
  const [showBody, setShowBody] = useState(false);
  const hasAttachments = Boolean(subject.attachments && subject.attachments.length > 0);
  const hasAny = subject.uri || subject.body || hasAttachments;

  if (!hasAny) {
    return <p className="text-xs text-gray-500">Self-contained — nothing else to look at.</p>;
  }

  return (
    <div className="space-y-2">
      {subject.uri && (
        <a
          href={subject.uri}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
        >
          Open referenced link &#8599;
        </a>
      )}

      {hasAttachments && (
        <div className="flex flex-wrap gap-2">
          {subject.attachments!.map((id) => (
            <AttachmentThumb key={id} conversationId={conversationId} attachmentId={id} />
          ))}
        </div>
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

/**
 * A subject attachment is a file-attachment id, downloadable through the
 * same conversation-scoped route the chat's FileMessage uses — the query's
 * own conversation, since the human is a participant in it. There is no
 * standalone metadata endpoint, so this fetches the file itself to learn
 * its content type before deciding whether to show a thumbnail.
 */
function AttachmentThumb({ conversationId, attachmentId }: { conversationId: string; attachmentId: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/human/conversations/${conversationId}/files/${attachmentId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("download failed");
        const contentType = res.headers.get("Content-Type") || "";
        if (!cancelled) setIsImage(contentType.startsWith("image/"));
        return res.blob();
      })
      .then((blob) => {
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, attachmentId]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (failed) {
    return (
      <span className="rounded border border-surface-border px-2 py-1 text-xs text-gray-500">
        Attachment unavailable
      </span>
    );
  }

  if (isImage && blobUrl) {
    return (
      <a href={blobUrl} target="_blank" rel="noreferrer">
        <img src={blobUrl} alt="Attachment" className="h-16 w-16 rounded border border-surface-border object-cover" />
      </a>
    );
  }

  return (
    <a
      href={blobUrl ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-1.5 rounded border border-surface-border px-2 py-1.5 text-xs text-gray-300",
        blobUrl ? "hover:bg-surface-elevated" : "opacity-60",
      )}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
      Attachment
    </a>
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
