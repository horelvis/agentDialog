import { useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { API_BASE } from "@/lib/constants";
import {
  browserStorage,
  buildSlug,
  randomSuffix,
  readAttribution,
  type Attribution,
} from "@/lib/attribution";

const MCP_URL = "https://api.agentdialog.io/mcp";
const QUICKSTART_URL = "https://docs.agentdialog.io/docs/quickstart";

/**
 * The ready-to-paste prompt, built by the server with this very key. If the
 * server does not provide one, the same text is built here from the origin the
 * page is served from, so the copy button always has something to give.
 */
function buildLocalPrompt(apiKey: string): string {
  const base = `${location.origin}`;
  return [
    `You are a brand-new AgentDialog agent. Your API key is \`${apiKey}\` and the AgentDialog API is at \`${base}\`.`,
    `Read your onboarding documentation at \`${base}/agent-context.md\` — it is the only thing you need to know about how AgentDialog works.`,
    "Set yourself up, then tell me you are ready. From now on, whenever you need a human's approval, a fact or a judgement, ask them through AgentDialog and report the answer back to me.",
  ].join("\n");
}

/**
 * A failure is stored as what went wrong, not as a sentence. Freezing the
 * sentence would leave an error written in the language that was on screen
 * when it happened, still there after somebody switches. `raw` is the one
 * exception: a message the API itself sent, which arrives already worded.
 */
type Failure =
  | { key: "form.error.taken" | "form.error.rateLimited" | "form.error.failed" | "form.error.unreachable" }
  | { key: "form.error.rateLimitedMinutes"; minutes: number }
  | { raw: string };

type State =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; failure: Failure }
  | { status: "done"; slug: string; apiKey: string; bootstrapPrompt: string };

async function register(slug: string, displayName: string, attribution: Attribution) {
  return fetch(`${API_BASE}/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      displayName,
      capabilities: ["chat", "tool-use"],
      // The register endpoint takes free-form metadata, so where this visitor
      // came from is stored with the agent itself. See lib/attribution.ts.
      ...(Object.keys(attribution).length > 0 ? { metadata: attribution } : {}),
    }),
  });
}

export function GetKeyForm() {
  const { t } = useTranslation("landing");
  const [name, setName] = useState("");
  const [suffix, setSuffix] = useState(randomSuffix);
  const [state, setState] = useState<State>({ status: "idle" });

  const slug = buildSlug(name || "My Agent", suffix);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (state.status === "submitting") return;

    setState({ status: "submitting" });
    const displayName = name.trim() || "My Agent";
    const attribution = readAttribution(browserStorage());

    try {
      let candidate = slug;
      let res = await register(candidate, displayName, attribution);

      // Someone took this slug between the preview and the submit. Try once
      // more with a fresh suffix before bothering the visitor about it.
      if (res.status === 409) {
        const retrySuffix = randomSuffix();
        setSuffix(retrySuffix);
        candidate = buildSlug(displayName, retrySuffix);
        res = await register(candidate, displayName, attribution);
      }

      if (res.status === 409) {
        setState({ status: "error", failure: { key: "form.error.taken" } });
        return;
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const minutes = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.ceil(retryAfter / 60)
          : null;
        setState({
          status: "error",
          failure: minutes
            ? { key: "form.error.rateLimitedMinutes", minutes }
            : { key: "form.error.rateLimited" },
        });
        return;
      }

      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.data?.apiKey) {
        const raw: string | undefined = body?.error?.message;
        setState({
          status: "error",
          failure: raw ? { raw } : { key: "form.error.failed" },
        });
        return;
      }

      setState({
        status: "done",
        slug: body.data.slug,
        apiKey: body.data.apiKey,
        bootstrapPrompt: body.data.bootstrapPrompt ?? buildLocalPrompt(body.data.apiKey),
      });
    } catch {
      setState({ status: "error", failure: { key: "form.error.unreachable" } });
    }
  }

  if (state.status === "done") {
    return <KeyIssued slug={state.slug} apiKey={state.apiKey} bootstrapPrompt={state.bootstrapPrompt} />;
  }

  const failure = state.status === "error" ? state.failure : null;
  const errorMessage = !failure
    ? null
    : "raw" in failure
      ? failure.raw
      : failure.key === "form.error.rateLimitedMinutes"
        ? t(failure.key, { minutes: failure.minutes })
        : t(failure.key);

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-md text-left">
      <label htmlFor="agent-name" className="sr-only">
        {t("form.label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          placeholder={t("form.placeholder")}
          className="block w-full rounded-lg border border-surface-border bg-surface-elevated px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <Button type="submit" size="lg" loading={state.status === "submitting"} className="shrink-0">
          {t("form.submit")}
        </Button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {/* Safe to interpolate unescaped only because buildSlug guarantees
            `[a-z0-9-]` — see the comment on its definition. */}
        <Trans
          t={t}
          i18nKey="form.preview"
          values={{ slug }}
          components={{ slug: <code className="text-gray-400" /> }}
        />
      </p>

      {errorMessage && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage}{" "}
          <a href={QUICKSTART_URL} className="underline underline-offset-2">
            {t("form.quickstart")}
          </a>
        </p>
      )}
    </form>
  );
}

function KeyIssued({
  slug,
  apiKey,
  bootstrapPrompt,
}: {
  slug: string;
  apiKey: string;
  bootstrapPrompt: string;
}) {
  const { t } = useTranslation("landing");
  // "Copy" and "Copied" are the same two words everywhere in the product, and
  // they already live in `common`.
  const { t: tCommon } = useTranslation("common");
  const [copied, setCopied] = useState<"prompt" | "key" | "config" | null>(null);

  const config = JSON.stringify(
    {
      mcpServers: {
        agentdialog: { url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } },
      },
    },
    null,
    2,
  );

  async function copy(what: "prompt" | "key" | "config", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard denied. The value is on screen and selectable.
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl rounded-xl border border-surface-border bg-surface-secondary p-5 text-left">
      <p className="text-sm font-semibold text-gray-100">
        {/* slug here is body.data.slug, the server's echo of the same
            buildSlug output that was submitted — same `[a-z0-9-]` guarantee. */}
        <Trans
          t={t}
          i18nKey="form.issued.title"
          values={{ slug }}
          components={{ slug: <code className="text-brand-400" /> }}
        />
      </p>
      <p className="mt-1 text-xs text-severity-warning">{t("form.issued.warning")}</p>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-sm text-gray-100">
          {apiKey}
        </code>
        <button
          type="button"
          onClick={() => copy("key", apiKey)}
          className="shrink-0 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-gray-300 hover:bg-surface-elevated"
        >
          {copied === "key" ? tCommon("action.copied") : tCommon("action.copy")}
        </button>
      </div>

      <p className="mt-4 text-xs font-medium text-gray-400">{t("form.issued.bootstrapLabel")}</p>
      <div className="mt-1 rounded-lg bg-gray-900">
        <div className="flex items-center justify-between border-b border-surface-border px-3 py-1.5">
          {/* The format name stays as-is in every language. */}
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-xs text-gray-500">prompt</span>
          <button
            type="button"
            onClick={() => copy("prompt", bootstrapPrompt)}
            className="text-xs text-gray-400 hover:text-white"
          >
            {copied === "prompt" ? tCommon("action.copied") : tCommon("action.copy")}
          </button>
        </div>
        <pre className="overflow-x-auto p-3 text-xs">
          <code className="whitespace-pre-wrap text-gray-100">{bootstrapPrompt}</code>
        </pre>
      </div>
      <p className="mt-2 text-xs text-gray-500">{t("form.issued.bootstrapHint")}</p>

      <p className="mt-4 text-xs font-medium text-gray-400">{t("form.issued.configLabel")}</p>
      <div className="mt-1 rounded-lg bg-gray-900">
        <div className="flex items-center justify-between border-b border-surface-border px-3 py-1.5">
          {/* The name of the format, not a word: it stays "json" everywhere. */}
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-xs text-gray-500">json</span>
          <button
            type="button"
            onClick={() => copy("config", config)}
            className="text-xs text-gray-400 hover:text-white"
          >
            {copied === "config" ? tCommon("action.copied") : tCommon("action.copy")}
          </button>
        </div>
        <pre className="overflow-x-auto p-3 text-xs">
          <code className="text-gray-100">{config}</code>
        </pre>
      </div>

      <a
        href={QUICKSTART_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-sm text-brand-400 underline underline-offset-2 hover:text-brand-300"
      >
        {t("form.issued.next")}
      </a>
    </div>
  );
}
