import { useState, type FormEvent } from "react";
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

type State =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "done"; slug: string; apiKey: string };

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
        setState({
          status: "error",
          message: "That name is taken twice over. Try a more specific one.",
        });
        return;
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const minutes = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.ceil(retryAfter / 60)
          : null;
        setState({
          status: "error",
          message: minutes
            ? `Too many keys from this network. Try again in ${minutes} min, or register from the terminal — see the quickstart.`
            : "Too many keys from this network. Register from the terminal instead — see the quickstart.",
        });
        return;
      }

      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.data?.apiKey) {
        setState({
          status: "error",
          message: body?.error?.message ?? "Could not create the key. Try the quickstart instead.",
        });
        return;
      }

      setState({ status: "done", slug: body.data.slug, apiKey: body.data.apiKey });
    } catch {
      setState({
        status: "error",
        message: "Could not reach the API. Check your connection and try again.",
      });
    }
  }

  if (state.status === "done") {
    return <KeyIssued slug={state.slug} apiKey={state.apiKey} />;
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-md text-left">
      <label htmlFor="agent-name" className="sr-only">
        Name your agent
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          placeholder="Name your agent — Release Agent"
          className="block w-full rounded-lg border border-surface-border bg-surface-elevated px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <Button type="submit" size="lg" loading={state.status === "submitting"} className="shrink-0">
          Get your API key
        </Button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Registers as <code className="text-gray-400">{slug}</code>
      </p>

      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {state.message}{" "}
          <a href={QUICKSTART_URL} className="underline underline-offset-2">
            Quickstart
          </a>
        </p>
      )}
    </form>
  );
}

function KeyIssued({ slug, apiKey }: { slug: string; apiKey: string }) {
  const [copied, setCopied] = useState<"key" | "config" | null>(null);

  const config = JSON.stringify(
    {
      mcpServers: {
        agentdialog: { url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } },
      },
    },
    null,
    2,
  );

  async function copy(what: "key" | "config", value: string) {
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
        <code className="text-brand-400">{slug}</code> is live. Here is its key.
      </p>
      <p className="mt-1 text-xs text-severity-warning">
        Shown once. Copy it now — losing it means rotating the key.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-sm text-gray-100">
          {apiKey}
        </code>
        <button
          type="button"
          onClick={() => copy("key", apiKey)}
          className="shrink-0 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-gray-300 hover:bg-surface-elevated"
        >
          {copied === "key" ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-4 text-xs font-medium text-gray-400">Paste into your MCP client config:</p>
      <div className="mt-1 rounded-lg bg-gray-900">
        <div className="flex items-center justify-between border-b border-surface-border px-3 py-1.5">
          <span className="text-xs text-gray-500">json</span>
          <button
            type="button"
            onClick={() => copy("config", config)}
            className="text-xs text-gray-400 hover:text-white"
          >
            {copied === "config" ? "Copied" : "Copy"}
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
        Now ask a human a question →
      </a>
    </div>
  );
}
