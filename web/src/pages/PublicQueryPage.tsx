import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { AnswerSpaceInput, isAnswerComplete } from "@/components/answer/AnswerSpaceInput";
import { Button } from "@/components/ui/Button";
import { API_BASE } from "@/lib/constants";
import { answerToWire } from "@/api/queries";
import { QueryContextHeader } from "@/components/queries/QueryContextHeader";
import { changeLanguage } from "@/i18n";
import { persistentStore } from "@/lib/storage";
import { readStoredLanguage, resolveLanguage } from "@/i18n/resolve";
import type { Answer, AnswerSpace, QueryChange, QuerySubject } from "@/api/types";

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
  subject: QuerySubject;
  // The route already sends both. The page used to declare neither, so a
  // renewed decision arrived here with its delta and showed none of it.
  changes?: QueryChange[] | null;
  answer_space: AnswerSpace;
  // Declared by the agent when it asked. It is a hint about who is reading,
  // not a translation of the question: the words below are the agent's own.
  language?: string | null;
}

const REASONS = [
  "unknown_subject",
  "missing_delta",
  "unclear_consequences",
  "referent_unreachable",
  "not_my_decision",
] as const;

/**
 * A failure is stored as what went wrong, not as a finished sentence — see
 * GetKeyForm. `raw` is the API's own wording, already worded and never
 * retranslated. The other two carry a namespace because this page's own
 * catalogue and `common` both contribute a possible cause.
 */
type Failure = { ns: "query"; key: "page.sendFailed" } | { ns: "common"; key: "error.unreachable" } | { raw: string };

type State =
  | { status: "loading" }
  | { status: "ready"; query: PublicQuery; failure?: Failure }
  | { status: "sending"; query: PublicQuery }
  | { status: "answered" }
  | { status: "returned" }
  | { status: "gone" };

export function PublicQueryPage() {
  const { token } = useParams();
  const { t } = useTranslation("query");
  const { t: tCommon } = useTranslation("common");
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

        // Precedence, and the one place all three sources meet. `persist:
        // false` is load-bearing: writing the agent's declaration to storage
        // would make it outrank every later declaration for good, from a
        // choice this person never made.
        void changeLanguage(
          resolveLanguage({
            stored: readStoredLanguage(persistentStore()),
            declared: body.data.language,
            navigator: navigator.languages,
          }),
          { persist: false },
        );
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
      const raw: string | undefined = body?.error?.message;
      setState({
        status: "ready",
        query,
        failure: raw ? { raw } : { ns: "query", key: "page.sendFailed" },
      });
    } catch {
      setState({ status: "ready", query, failure: { ns: "common", key: "error.unreachable" } });
    }
  }

  if (state.status === "loading") {
    return (
      <Shell>
        <p className="text-gray-400">{tCommon("state.loading")}</p>
      </Shell>
    );
  }

  // Expired, already used and never-existed are one case on purpose: the API
  // does not distinguish them, and neither should this.
  if (state.status === "gone") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">{t("page.gone.title")}</h1>
        <p className="mt-2 text-gray-400">{t("page.gone.body")}</p>
      </Shell>
    );
  }

  if (state.status === "answered") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">{t("page.answered.title")}</h1>
        <p className="mt-2 text-gray-400">{t("page.answered.body")}</p>
      </Shell>
    );
  }

  if (state.status === "returned") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">{t("page.returned.title")}</h1>
        <p className="mt-2 text-gray-400">{t("page.returned.body")}</p>
      </Shell>
    );
  }

  const { query } = state;
  const busy = state.status === "sending";
  const errorMessage =
    state.status === "ready" && state.failure
      ? "raw" in state.failure
        ? state.failure.raw
        : state.failure.ns === "common"
          ? tCommon(state.failure.key)
          : t(state.failure.key)
      : null;

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
            <p className="text-xs text-gray-500">{t("page.asking")}</p>
          </div>
        </div>
      )}

      <h1 className="text-xl font-semibold text-gray-100">{query.question}</h1>

      {/* The same component the chat uses, rather than a second rendering of the
          same fields. It brings what this page was missing: the referenced link,
          checked again with isHttpUrl before it becomes an href, and the delta of
          a renewed decision. It also keeps the referent behind a toggle and in a
          box that scrolls — a subject body may be 100,000 characters, and pouring
          those onto the page pushes the answer out of reach. */}
      <div className="mt-4">
        <QueryContextHeader
          subject={query.subject}
          changes={query.changes ?? null}
          priorDecisionAt={null}
        />
      </div>

      {query.context && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("page.contextLabel")}</p>
          <p className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-gray-400">
            {query.context}
          </p>
        </div>
      )}

      <div className="mt-6">
        <AnswerSpaceInput space={query.answer_space} value={answer} onChange={setAnswer} />
      </div>

      {errorMessage && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {errorMessage}
        </p>
      )}

      <Button
        className="mt-6 w-full"
        size="lg"
        loading={busy}
        disabled={!isAnswerComplete(query.answer_space, answer)}
        onClick={() => answer && send({ outcome: "answer", answer: answerToWire(answer) }, { status: "answered" })}
      >
        {t("page.send")}
      </Button>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-gray-400">{t("page.cantAnswer")}</summary>
        <div className="mt-3 space-y-2">
          {REASONS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="radio"
                name="reason"
                value={id}
                checked={reason === id}
                onChange={() => setReason(id)}
              />
              {t(`reasons.${id}`)}
            </label>
          ))}
          <Button
            variant="secondary"
            className="mt-2"
            loading={busy}
            disabled={!reason}
            onClick={() => send({ outcome: "insufficient_context", reason }, { status: "returned" })}
          >
            {t("page.sendBack")}
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
