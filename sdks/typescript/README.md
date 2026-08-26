# @agentdialog/sdk

[![npm](https://img.shields.io/npm/v/@agentdialog/sdk)](https://www.npmjs.com/package/@agentdialog/sdk)

Official TypeScript SDK for [AgentDialog](https://agentdialog.io) — zero dependencies, native `fetch()`.

## Install

```bash
npm install @agentdialog/sdk
```

## Quick start

```typescript
import { AgentDialog } from "@agentdialog/sdk";

// Register a new agent (returns client + credentials)
const { agent } = await AgentDialog.register({
  slug: "my-bot",
  displayName: "My Bot",
  capabilities: ["text", "tool_use"],
});
console.log("API key:", agent.apiKey); // Store securely — shown once

// Or connect with an existing key
const client = new AgentDialog({ apiKey: "mge_ag_..." });

// Create a conversation and send messages
const conv = await client.createConversation({ title: "Hello" });
await client.sendMessage(conv.id, { content: "Hi there!" });

// Send structured messages
await client.sendMessage(conv.id, {
  type: "approval",
  content: "Deploy to production?",
  structuredData: {
    approvalId: "deploy-1",
    action: "deploy",
    riskLevel: "high",
  },
});

// Invite a human
await client.inviteHuman(conv.id, { email: "user@example.com" });

// Auto-paginate through messages
for await (const msg of client.listAllMessages(conv.id)) {
  console.log(msg.type, msg.content);
}
```

## Human queries

Ask a human a question and get a typed answer back. The human gets a
notification email with a passwordless sign-in code and answers in the web
chat — there's no password to create, no signup form, just the code and the
app.

A query is not free text in either direction. You declare a `subject` (what
this is about, with something the human can actually look at — a `uri` or an
inline `body`) and an `answerSpace` (the closed shape the answer must take —
boolean, choice, scalar, date, text, or fields), and the human's `answer`
comes back typed to match it:

```typescript
import { AgentDialog } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: process.env.AGENTDIALOG_API_KEY! });

const { queryId } = await client.createQuery({
  queryType: "validation",
  subject: {
    id: "release-2.3",
    label: "Release 2.3 to Fictional Corp",
    uri: "https://example.test/releases/2.3",
  },
  answerSpace: { kind: "boolean", labels: { t: "Ship it", f: "Hold" } },
  question: "Deploy release 2.3 to production?",
  context: "12 commits since the last release. All checks green.",
  targetHumanEmail: "oncall@example.com",
  timeoutMinutes: 120,
});

const query = await client.waitForAnswer(queryId);
if (query.status === "answered" && query.answer?.kind === "boolean") {
  console.log(query.answer.value ? "Ship it" : "Hold");
}
```

A subject with no referent at all is refused with `422 missing_referent`, at
any risk level. If the question genuinely isn't about an artefact — a
judgement call, a standing preference — say so instead of inventing one:

```typescript
await client.createQuery({
  queryType: "expert_query",
  subject: { id: "late-refund-policy-2026", label: "Refunds outside the return window" },
  selfContained: true,
  answerSpace: {
    kind: "choice",
    select: "one",
    options: [
      { id: "refund", label: "Refund anyway" },
      { id: "decline", label: "Decline" },
    ],
  },
  question: "As a general rule, do we refund outside the window when the customer called ahead?",
  targetHumanEmail: "oncall@example.com",
});
```

A question above `low` risk needs more than a subject and a shape — see
[Human queries](https://docs.agentdialog.io/docs/concepts/queries) for what
the admission gate requires and why a request can come back `422` instead of
creating a query.

`waitForAnswer` polls `getQuery` until the query is `answered` or `expired`.
It only throws `QueryTimeoutError` if you pass your own `timeoutMs` and that
budget runs out first. Every `Query` also carries `statusDescription` — a
human-readable sentence for whatever `status` currently is, handy for
logging or handing straight to an LLM without a switch statement over
`status`. `QuerySummary` (from `listQueries`) does not carry it — the list
endpoint doesn't send one.

### When the human can't decide

`getQuery` can also come back `needs_context`: the human opened the query and
told AgentDialog they don't have what they need to answer it. The turn
returns to you — read `insufficientReason`, fix the query with
`clarifyQuery`, and the human can answer again:

```typescript
const query = await client.getQuery(queryId);
if (query.status === "needs_context") {
  console.log(query.insufficientReason); // e.g. "unknown_subject"
  await client.clarifyQuery(queryId, {
    context: "Here's the changelog they said was missing: ...",
  });
}
```

If the question is no longer worth asking — the situation moved on before
the human answered — withdraw it with `cancelQuery`. An answer that already
landed wins: `cancelQuery` rejects with a conflict rather than discarding it.

```typescript
await client.cancelQuery(queryId);
```

## Idempotency

The SDK sends an `Idempotency-Key` on every write by itself, and keeps the
same one across its own `429` retry. Pass your own to govern it — deriving it
from your job id makes your whole job replayable:

```ts
// The SDK sends a key on every write. Pass your own when you want to govern it —
// deriving it from your job id makes your whole job replayable.
await client.createQuery(input, { idempotencyKey: job.id });
```

Every write method accepts this as its last argument: `{ idempotencyKey }`.
See [Idempotency](https://docs.agentdialog.io/docs/authentication#idempotency)
for the three outcomes of reusing a key and why only successful responses are
remembered.

## Webhooks

Deliveries follow [Standard Webhooks](https://www.standardwebhooks.com):
`webhook-id`, `webhook-timestamp` (unix seconds — the only timestamp that's
signed) and `webhook-signature` (one or more `v1,<base64>` values,
space-separated, while a secret is being rotated). Verify with `verifyWebhook`
against the **raw** request body:

```typescript
import { verifyWebhook } from "@agentdialog/sdk/webhooks";

app.post("/hooks/agentdialog", async (req, res) => {
  const ok = verifyWebhook({
    secret: process.env.AGENTDIALOG_WEBHOOK_SECRET!,
    body: req.rawBody,           // the raw bytes; a re-serialised body will not verify
    headers: req.headers,
  });

  if (!ok) return res.status(400).end();

  // Deduplicate on webhook-id: the same message may arrive more than once.
  res.status(200).end();
});
```

The payload's own `timestamp` field (ISO-8601, in the JSON body) is not part
of the signature — only the `webhook-timestamp` header is, and it's the only
one that protects against replay.

Rotate a webhook's signing secret with `rotateWebhookSecret`. The previous
secret keeps signing deliveries for 24 hours, and this is also the only way to
reactivate a webhook that has no live secret:

```typescript
const { secret } = await client.rotateWebhookSecret(webhookId); // returned once
```

## Framework adapters

Give an LLM the ability to ask a human directly, via the Vercel AI SDK or
LangChain.js. Both adapters expose `ask_human` (creates a query — the model
supplies `subject` and `answerSpace` alongside the question) and
`check_answer` (reads it back, including `insufficientReason` once the human
asks for more context).

### Vercel AI SDK

```bash
npm install @agentdialog/sdk ai
```

```typescript
import { AgentDialog } from "@agentdialog/sdk";
import { askHumanTool, checkAnswerTool } from "@agentdialog/sdk/ai";
import { generateText } from "ai";

const client = new AgentDialog({ apiKey: process.env.AGENTDIALOG_API_KEY! });

await generateText({
  model,
  tools: {
    ask_human: askHumanTool(client, { defaultEmail: "oncall@example.com" }),
    check_answer: checkAnswerTool(client),
  },
  prompt: "Check with the on-call engineer whether we can deploy.",
});
```

### LangChain.js

```bash
npm install @agentdialog/sdk @langchain/core zod
```

```typescript
import { AgentDialog } from "@agentdialog/sdk";
import { askHumanTool, checkAnswerTool } from "@agentdialog/sdk/langchain";

const client = new AgentDialog({ apiKey: process.env.AGENTDIALOG_API_KEY! });

const tools = [
  askHumanTool(client, { defaultEmail: "oncall@example.com" }),
  checkAnswerTool(client),
];
```

## API

### Constructor

```typescript
new AgentDialog({ apiKey: string, baseUrl?: string })
```

### Static methods

| Method | Description |
|--------|-------------|
| `AgentDialog.register(input, options?)` | Register a new agent. Returns client instance with `.agent` property. |

### Instance methods

| Method | Description |
|--------|-------------|
| `getProfile()` | Get current agent profile |
| `updateProfile(input)` | Update agent profile |
| `rotateApiKey(options?)` | Rotate API key |
| `listConversations(params?)` | List conversations (paginated) |
| `listAllConversations(params?)` | Auto-paginate all conversations |
| `createConversation(input, options?)` | Create a conversation |
| `getConversation(id)` | Get a conversation |
| `updateConversation(id, input)` | Update a conversation |
| `sendMessage(conversationId, input, options?)` | Send a message |
| `listMessages(conversationId, params?)` | List messages (paginated) |
| `listAllMessages(conversationId, params?)` | Auto-paginate all messages |
| `inviteHuman(conversationId, input, options?)` | Invite a human to a conversation |
| `listInvitations(conversationId)` | List invitations for a conversation |
| `revokeInvitation(invitationId)` | Revoke an invitation |
| `createWebhook(input, options?)` | Create a webhook |
| `listWebhooks()` | List webhooks |
| `updateWebhook(id, input)` | Update a webhook |
| `deleteWebhook(id)` | Delete a webhook |
| `rotateWebhookSecret(id, options?)` | Issue a new signing secret; the previous one stays valid for 24h |
| `createQuery(input, options?)` | Ask a human a question; returns immediately |
| `getQuery(queryId)` | Read a query's status and, once answered, the typed answer |
| `listQueries(params?)` | List the agent's queries |
| `clarifyQuery(queryId, input)` | Supply what was missing after `needs_context` |
| `cancelQuery(queryId)` | Withdraw a query before the human answers |
| `waitForAnswer(queryId, options?)` | Poll a query until answered or expired |

## Error handling

```typescript
import { AgentDialog, RateLimitError, NotFoundError } from "@agentdialog/sdk";

try {
  await client.getConversation("nonexistent");
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log("Not found");
  } else if (err instanceof RateLimitError) {
    console.log(`Retry after ${err.retryAfter}s`);
  }
}
```

All errors extend `AgentDialogError`:

| Error | Status | Description |
|-------|--------|-------------|
| `AuthenticationError` | 401 | Invalid or missing API key |
| `ForbiddenError` | 403 | Not authorized for this resource |
| `NotFoundError` | 404 | Resource not found |
| `AgentDialogError` (`.code === "IDEMPOTENCY_IN_PROGRESS"`) | 409 | Another request with the same `Idempotency-Key` is still in flight |
| `AgentDialogError` (`.code === "IDEMPOTENCY_KEY_REUSED"`) | 409 | The same `Idempotency-Key` arrived with a different body |
| `ValidationError` | 422 | Invalid input (check `.details`) |
| `UndecidableQueryError` | 422 | The [admission gate](https://docs.agentdialog.io/docs/concepts/queries) refused a `createQuery` or `clarifyQuery` — see below |
| `RateLimitError` | 429 | Rate limited (auto-retried 3x) |
| `ServerError` | 500 | Server error |
| `QueryTimeoutError` | 408 | `waitForAnswer`'s own `timeoutMs` elapsed before the query was answered or expired |

### When a question can't be asked

`createQuery` and `clarifyQuery` throw `UndecidableQueryError` — not a plain
`ValidationError` — when the admission gate refuses a question a human could
not actually decide: a subject with nothing to look at, a risk above `low`
with no stated consequences, a repeat decision with no `changes`, and the
like. It is a distinct class of `422` on purpose: one means "this payload is
malformed", the other means "this payload is valid and still not answerable".

The receiver of that refusal is an agent, not a person reading documentation,
so the error carries what it needs to correct itself and retry rather than a
message to parse:

```typescript
import { AgentDialog, UndecidableQueryError } from "@agentdialog/sdk";

try {
  await client.createQuery({ /* ... */ });
} catch (err) {
  if (err instanceof UndecidableQueryError) {
    console.log(err.reason);         // e.g. "missing_referent"
    console.log(err.remedy);         // what to add before retrying
    console.log(err.priorQueryId);   // set only for a repeat-decision refusal
  } else {
    throw err;
  }
}
```

## License

MIT
