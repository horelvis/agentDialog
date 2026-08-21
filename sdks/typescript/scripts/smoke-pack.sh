#!/bin/bash
# ============================================
# Package smoke test: pack the SDK, install the tarball into a clean project
# OUTSIDE this repository, and prove it resolves — at type level and at runtime.
#
# Everything else we run (unit tests, tsc, the dist tests) executes inside the
# monorepo, where TypeScript inherits @types/* from ancestor directories and
# Bun resolves modules from a hoisted node_modules. That masked a real bug: the
# package compiled for months only because it was borrowing @types/bun from the
# repository root, and would not build on its own.
#
# This runs from a temp directory with no ancestor node_modules, which is the
# environment an actual consumer has.
#
# Usage: bun run test:pack   (builds first, then runs this)
# ============================================
set -euo pipefail

SDK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> SDK:  $SDK_DIR"
echo "==> Temp: $WORK"
echo ""

if [ ! -d "$SDK_DIR/dist" ]; then
  echo "FAIL: dist/ is missing — run the build first" >&2
  exit 1
fi

echo "==> Packing"
TARBALL="$(cd "$SDK_DIR" && npm pack --silent --pack-destination "$WORK")"
echo "    $TARBALL"
echo ""

echo "==> Installing into a clean project"
cd "$WORK"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
# The adapter subpaths need their optional peers present to resolve.
npm install --silent --no-audit --no-fund \
  "$WORK/$TARBALL" \
  typescript \
  ai \
  @langchain/core \
  zod
echo ""

echo "==> Runtime resolution (Node ESM, no bundler)"
cat > consumer.mjs <<'JS'
import { AgentDialog, QueryTimeoutError } from "@agentdialog/sdk";
import { askHumanTool, checkAnswerTool } from "@agentdialog/sdk/ai";
import { askHumanTool as lcAsk } from "@agentdialog/sdk/langchain";

const client = new AgentDialog({ apiKey: "mge_ag_test" });

const checks = [
  ["AgentDialog is constructible", client instanceof AgentDialog],
  ["createQuery exists", typeof client.createQuery === "function"],
  ["getQuery exists", typeof client.getQuery === "function"],
  ["listQueries exists", typeof client.listQueries === "function"],
  ["clarifyQuery exists", typeof client.clarifyQuery === "function"],
  ["cancelQuery exists", typeof client.cancelQuery === "function"],
  ["waitForAnswer exists", typeof client.waitForAnswer === "function"],
  ["QueryTimeoutError is an Error", new QueryTimeoutError("q", 1) instanceof Error],
  ["ai askHumanTool builds", typeof askHumanTool(client, { defaultEmail: "a@b.test" }) === "object"],
  ["ai checkAnswerTool builds", typeof checkAnswerTool(client) === "object"],
  ["langchain askHumanTool builds", lcAsk(client, { defaultEmail: "a@b.test" }).name === "ask_human"],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`    ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
process.exit(failed === 0 ? 0 : 1);
JS
node consumer.mjs
echo ""

# Two typechecks, because they answer different questions.
#
# The first is strict — skipLibCheck off — so tsc reads our own .d.ts files in
# full and a malformed declaration fails here rather than in a user's editor.
# It imports only the root entry point, which is the part that must stand alone.
#
# The second covers the adapter subpaths. Those necessarily drag in the
# frameworks' declarations, and `ai` and `@langchain/core` need @types/node and
# a newer lib to typecheck their own internals. Auditing THEIR .d.ts is not this
# test's job, so it runs with skipLibCheck on: it verifies our subpaths resolve
# and compose with the frameworks, not that the frameworks are well-typed.

echo "==> Type resolution, root entry point (strict, skipLibCheck off)"
cat > tsconfig.core.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false
  },
  "include": ["consumer-core.ts"]
}
JSON

cat > consumer-core.ts <<'TS'
import { AgentDialog, QueryTimeoutError } from "@agentdialog/sdk";
import type { Query, QueryStatus, CreatedQuery, QuerySummary } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: "mge_ag_test" });

export async function main(): Promise<void> {
  const created: CreatedQuery = await client.createQuery({
    queryType: "validation",
    subject: { id: "deploy-v2.3", label: "Deploy v2.3 to production" },
    answerSpace: { kind: "boolean", labels: { t: "Yes", f: "No" } },
    question: "Deploy?",
    targetHumanEmail: "oncall@example.com",
    timeoutMinutes: 30,
  });

  const summaries: QuerySummary[] = await client.listQueries({ status: "pending", limit: 5 });
  void summaries;

  try {
    const answered: Query = await client.waitForAnswer(created.queryId, { timeoutMs: 1000 });
    const status: QueryStatus = answered.status;
    void status;
    if (status === "needs_context") {
      const clarified: Query = await client.clarifyQuery(created.queryId, {
        answerSpace: { kind: "text", maxLength: 200 },
      });
      void clarified;
    }
    const cancelled: Query = await client.cancelQuery(created.queryId);
    void cancelled;
  } catch (err) {
    if (err instanceof QueryTimeoutError) return;
    throw err;
  }
}
TS

npx --no-install tsc -p tsconfig.core.json
echo "    ok    root entry point typechecks, declarations included"
echo ""

echo "==> Type resolution, adapter subpaths (skipLibCheck on)"
npm install --silent --no-audit --no-fund @types/node >/dev/null

cat > tsconfig.adapters.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ESNext", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["consumer-adapters.ts"]
}
JSON

cat > consumer-adapters.ts <<'TS'
import { AgentDialog } from "@agentdialog/sdk";
import { askHumanTool, checkAnswerTool } from "@agentdialog/sdk/ai";
import { askHumanTool as lcAsk, checkAnswerTool as lcCheck } from "@agentdialog/sdk/langchain";

const client = new AgentDialog({ apiKey: "mge_ag_test" });

export const aiTools = {
  ask_human: askHumanTool(client, { defaultEmail: "oncall@example.com", timeoutMinutes: 30 }),
  check_answer: checkAnswerTool(client),
};

export const langchainTools = [
  lcAsk(client, { defaultEmail: "oncall@example.com" }),
  lcCheck(client),
];
TS

npx --no-install tsc -p tsconfig.adapters.json
echo "    ok    both adapter subpaths typecheck against their frameworks"
echo ""

echo "==> Package smoke test passed"
