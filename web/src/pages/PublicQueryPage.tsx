import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { AnswerSpaceInput, isAnswerComplete } from "@/components/answer/AnswerSpaceInput";
import { Button } from "@/components/ui/Button";
import { API_BASE } from "@/lib/constants";
import { answerToWire } from "@/api/queries";
import type { Answer, AnswerSpace } from "@/api/types";

/**
 * The one page that shows a question without a session. What the holder of a
 * link may do here is exactly what the grant allows: answer it, or hand it back
 * for more detail. Nothing else — no thread, no other queries, no sign-in.
 */

interface PublicQuery {
  query_id: string;
  agent: { slug: string; display_name: string; avatar_url?: string | null } | null;
  question: string;
  context?: string | null;
  risk: string;
  subject: { id: string; label: string; body?: string | null; uri?: string | null };
  answer_space: AnswerSpace;
}

const REASONS = [
  { id: "unknown_subject", label: "I don't know what this is about" },
  { id: "missing_delta", label: "I don't know what changed since last time" },
  { id: "unclear_consequences", label: "I can't tell what each option would do" },
  { id: "referent_unreachable", label: "I can't see the thing being asked about" },
  { id: "not_my_decision", label: "This isn't mine to decide" },
] as const;

type State =
  | { status: "loading" }
  | { status: "ready"; query: PublicQuery; error?: string }
  | { status: "sending"; query: PublicQuery }
  | { status: "answered" }
  | { status: "returned" }
  | { status: "gone" };

export function PublicQueryPage() {
  const { token } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/queries/${token}`);
        if (cancelled) return;
        if (!res.ok) return setState({ status: "gone" });

        const body = await res.json();
        setState({ status: "ready", query: body.data });
      } catch {
        if (!cancelled) setState({ status: "gone" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function send(payload: unknown, done: State) {
    if (state.status !== "ready") return;
    const { query } = state;
    setState({ status: "sending", query });

    try {
      const res = await fetch(`${API_BASE}/public/queries/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) return setState(done);

      // Only a dead link is a dead link. Collapsing every failure into that
      // screen tells someone their link expired when in truth the send was
      // rejected — and throws away an answer they can still send.
      if (res.status === 401) return setState({ status: "gone" });

      const body = await res.json().catch(() => null);
      setState({
        status: "ready",
        query,
        error: body?.error?.message ?? "That didn't send. Try again.",
      });
    } catch {
      setState({ status: "ready", query, error: "Could not reach the server. Try again." });
    }
  }

  if (state.status === "loading") {
    return (
      <Shell>
        <p className="text-gray-400">Loading…</p>
      </Shell>
    );
  }

  // Expired, already used and never-existed are one case on purpose: the API
  // does not distinguish them, and neither should this.
  if (state.status === "gone") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">This link no longer works</h1>
        <p className="mt-2 text-gray-400">
          It may have been used already, or the question may have closed. Sign in to the app to
          see anything still waiting for you.
        </p>
      </Shell>
    );
  }

  if (state.status === "answered") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">Answer sent</h1>
        <p className="mt-2 text-gray-400">Thank you — you can close this page.</p>
      </Shell>
    );
  }

  if (state.status === "returned") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">Sent back for more detail</h1>
        <p className="mt-2 text-gray-400">
          They will get back to you. This link keeps working, so you can return to it.
        </p>
      </Shell>
    );
  }

  const { query } = state;
  const busy = state.status === "sending";

  return (
    <Shell>
      {query.agent && (
        <div className="mb-5 flex items-center gap-3 border-b border-surface-border pb-4">
          {query.agent.avatar_url ? (
            <img src={query.agent.avatar_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              {query.agent.display_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-100">{query.agent.display_name}</p>
            <p className="text-xs text-gray-500">is asking you a question</p>
          </div>
        </div>
      )}

      <p className="text-xs uppercase tracking-wide text-gray-500">{query.subject.label}</p>
      <h1 className="mt-1 text-xl font-semibold text-gray-100">{query.question}</h1>

      {query.subject.body && (
        <div className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-secondary p-4 text-sm text-gray-300">
          {query.subject.body}
        </div>
      )}

      {query.context && <p className="mt-4 text-sm text-gray-400">{query.context}</p>}

      <div className="mt-6">
        <AnswerSpaceInput space={query.answer_space} value={answer} onChange={setAnswer} />
      </div>

      {state.status === "ready" && state.error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {state.error}
        </p>
      )}

      <Button
        className="mt-6 w-full"
        size="lg"
        loading={busy}
        disabled={!isAnswerComplete(query.answer_space, answer)}
        onClick={() => answer && send({ outcome: "answer", answer: answerToWire(answer) }, { status: "answered" })}
      >
        Send answer
      </Button>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-gray-400">I can't answer this</summary>
        <div className="mt-3 space-y-2">
          {REASONS.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="radio"
                name="reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
              />
              {r.label}
            </label>
          ))}
          <Button
            variant="secondary"
            className="mt-2"
            loading={busy}
            disabled={!reason}
            onClick={() => send({ outcome: "insufficient_context", reason }, { status: "returned" })}
          >
            Send it back
          </Button>
        </div>
      </details>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-surface-border bg-surface-primary p-6">{children}</div>
    </div>
  );
}
