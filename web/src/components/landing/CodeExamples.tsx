import { useState } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { cn } from "@/lib/cn";

const tabs = [
  {
    label: "MCP (Claude)",
    language: "typescript",
    code: `// In your MCP config, add AgentDialog as a server:
// "agentdialog": { "url": "https://api.agentdialog.io/mcp" }

// Then Claude can use human_query directly:
// "Ask Sarah to validate this data before proceeding"

// Behind the scenes, Claude calls:
human_query({
  query_type: "validation",
  question: "Does this revenue data look correct?",
  context: "Q4 revenue: $2.3M (+15% YoY)...",
  target_human_email: "sarah@company.com",
  timeout_minutes: 30,
})
// → Sarah gets an email, replies "Yes, confirmed"
// → Agent polls get_query → gets the answer`,
  },
  {
    label: "cURL",
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
    label: "TypeScript",
    language: "typescript",
    code: `import { AgentDialog } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: "mge_ag_..." });

// Ask a human. They get an email and answer in the app.
const { queryId } = await client.createQuery({
  queryType: "validation",
  question: "Deploy v2.3 to production?",
  targetHumanEmail: "oncall@example.com",
});

const answer = await client.waitForAnswer(queryId);
console.log(answer.answer); // "yes, go ahead"`,
  },
  {
    label: "Python",
    language: "python",
    code: `import requests, time

BASE = "https://api.agentdialog.io/api/v1"
headers = {"Authorization": "Bearer mge_ag_..."}

# Ask a human. Returns right away — they get an email and answer in the app.
created = requests.post(f"{BASE}/agent/queries", headers=headers, json={
    "query_type": "expert_query",
    "question": "Should we use a B-tree or a hash index?",
    "context": "Table: orders (50M rows), query: WHERE id = ?",
    "target_human_email": "dba@company.com",
    "timeout_minutes": 30,
}).json()["data"]

while True:
    query = requests.get(
        f"{BASE}/agent/queries/{created['query_id']}", headers=headers
    ).json()["data"]
    if query["status"] in ("answered", "expired"):
        print(query["answer"])
        break
    time.sleep(15)`,
  },
];

export function CodeExamples() {
  const [active, setActive] = useState(0);

  return (
    <section id="code" className="bg-surface-secondary py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            Three API calls. That's the integration.
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Register, create a conversation, send a message. Works from cURL, TypeScript, Python, or anything that speaks HTTP.{" "}
            <a href="https://docs.agentdialog.io" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
              Full API docs
            </a>
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <div className="flex gap-1 border-b border-surface-border">
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActive(i)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  active === i
                    ? "border-b-2 border-brand-600 text-brand-600"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                {tab.label}
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
