import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { cn } from "@/lib/cn";

/**
 * The samples are code, so they are the same in every language: not the curl,
 * not the TypeScript, not a field name. Each tab keeps an id that names its
 * label key, and nothing else here goes near the catalogue.
 *
 * There is no MCP tab, deliberately. Over MCP nobody writes a `human_query`
 * call — the client does, from a sentence you type at it — so a tab here could
 * only have been prose dressed as code. What an MCP user actually needs is the
 * server config, and GetKeyForm already hands them that, filled in with their
 * own key, the moment the key is issued.
 */
const tabs = [
  {
    id: "curl",
    language: "bash",
    code: `# 1. Register your agent
curl -X POST https://api.agentdialog.io/api/v1/agent/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "slug": "my-agent",
    "displayName": "My AI Agent",
    "capabilities": ["chat", "tool-use"]
  }'

# 2. Create a conversation
curl -X POST https://api.agentdialog.io/api/v1/agent/conversations \\
  -H "Authorization: Bearer mge_ag_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "Code Review" }'

# 3. Send a message
curl -X POST https://api.agentdialog.io/api/v1/agent/conversations/{id}/messages \\
  -H "Authorization: Bearer mge_ag_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "type": "text", "content": "Review complete!" }'`,
  },
  {
    id: "typescript",
    language: "typescript",
    code: `import { AgentDialog } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: "mge_ag_..." });

// Ask a human. They get an email and answer in the app.
const { queryId } = await client.createQuery({
  queryType: "validation",
  subject: {
    id: "release-2.3",
    label: "Release 2.3 to Fictional Corp",
    uri: "https://example.test/releases/2.3",
  },
  answerSpace: { kind: "boolean", labels: { t: "Ship it", f: "Hold" } },
  question: "Deploy release 2.3 to production?",
  targetHumanEmail: "oncall@example.com",
});

const query = await client.waitForAnswer(queryId);
if (query.status === "answered" && query.answer?.kind === "boolean") {
  console.log(query.answer.value ? "Ship it" : "Hold");
}`,
  },
  {
    id: "python",
    language: "python",
    code: `import requests, time

BASE = "https://api.agentdialog.io/api/v1"
headers = {"Authorization": "Bearer mge_ag_..."}

# Ask a human. Returns right away — they get an email and answer in the app.
created = requests.post(f"{BASE}/agent/queries", headers=headers, json={
    "query_type": "expert_query",
    # A judgement call with no artefact to look at says so, instead of
    # inventing a referent. Any other subject needs a "uri" or a "body".
    "subject": {
        "id": "orders-index-choice",
        "label": "Index choice for orders.id lookups",
    },
    "self_contained": True,
    "answer_space": {
        "kind": "choice",
        "select": "one",
        "options": [
            {"id": "btree", "label": "B-tree"},
            {"id": "hash", "label": "Hash index"},
        ],
    },
    "question": "Should we use a B-tree or a hash index?",
    "context": "Table: orders (50M rows), query: WHERE id = ?",
    "target_human_email": "dba@example.com",
    "timeout_minutes": 30,
}).json()["data"]

while True:
    query = requests.get(
        f"{BASE}/agent/queries/{created['query_id']}", headers=headers
    ).json()["data"]
    if query["status"] in ("answered", "expired"):
        print(query["answer"])  # e.g. {"kind": "choice", "option_ids": ["btree"]}
        break
    time.sleep(15)`,
  },
] as const;

export function CodeExamples() {
  const { t } = useTranslation("landing");
  const [active, setActive] = useState(0);

  return (
    <section id="code" className="bg-surface-secondary py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            {t("examples.heading")}
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            <Trans
              t={t}
              i18nKey="examples.intro"
              components={{
                docs: (
                  <a
                    href="https://docs.agentdialog.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
                  />
                ),
              }}
            />
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <div className="flex gap-1 border-b border-surface-border">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActive(i)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  active === i
                    ? "border-b-2 border-brand-600 text-brand-600"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                {t(`examples.tabs.${tab.id}`)}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <CodeBlock code={tabs[active].code} language={tabs[active].language} />
          </div>
        </div>
      </div>
    </section>
  );
}
