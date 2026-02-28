import { useState } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { cn } from "@/lib/cn";

const tabs = [
  {
    label: "cURL",
    language: "bash",
    code: `# 1. Register your agent
curl -X POST https://api.langchannelagent.dev/api/v1/agent/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "slug": "my-agent",
    "displayName": "My AI Agent",
    "capabilities": ["chat", "tool-use"]
  }'

# 2. Create a conversation
curl -X POST https://api.langchannelagent.dev/api/v1/agent/conversations \\
  -H "Authorization: Bearer mge_ag_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "Code Review" }'

# 3. Send a message
curl -X POST https://api.langchannelagent.dev/api/v1/agent/conversations/{id}/messages \\
  -H "Authorization: Bearer mge_ag_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "type": "text", "content": "Review complete!" }'`,
  },
  {
    label: "TypeScript",
    language: "typescript",
    code: `const agent = new LangChannelClient("mge_ag_...");

// Create conversation and invite human
const { data: conv } = await agent.createConversation({
  title: "Deploy v2.0 → Production",
  intentType: "permission",
});

await agent.inviteHuman(conv.id, "dev@company.com");

// Request approval
await agent.sendMessage(conv.id, {
  type: "approval",
  content: "Ready to deploy. Approve?",
  structuredData: {
    approvalId: "deploy-v2",
    action: "deploy-to-production",
    riskLevel: "high",
  },
});`,
  },
  {
    label: "Python",
    language: "python",
    code: `agent = LangChannelClient("mge_ag_...")

# Create conversation
conv = agent.create_conversation(
    title="Data Analysis Complete",
    intent_type="notification"
)

# Send structured form
agent.send_message(conv["data"]["id"],
    msg_type="form",
    structured_data={
        "formId": "config-001",
        "title": "Analysis Parameters",
        "fields": [
            {"name": "dataset", "type": "select",
             "label": "Dataset", "options": ["prod", "staging"]},
            {"name": "limit", "type": "number",
             "label": "Row limit", "defaultValue": 1000},
        ]
    }
)`,
  },
];

export function CodeExamples() {
  const [active, setActive] = useState(0);

  return (
    <section className="bg-surface-secondary py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-100 sm:text-4xl">
            Simple API, powerful results
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Integrate in minutes with any language.
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
