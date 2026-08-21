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
this is about, with something the human can actually look at) and an
`answerSpace` (the closed shape the answer must take — boolean, choice,
scalar, date, text, or fields), and the human's `answer` comes back typed to
match it:

```typescript
import { AgentDialog } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: process.env.AGENTDIALOG_API_KEY! });

const { queryId } = await client.createQuery({
  queryType: "validation",
  subject: { id: "release-2.3", label: "Release 2.3 to Fictional Corp" },
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

A question above `low` risk needs more than a subject and a shape — see
[Human queries](https://docs.agentdialog.io/docs/concepts/queries) for what
the admission gate requires and why a request can come back `422` instead of
creating a query.

`waitForAnswer` polls `getQuery` until the query is `answered` or `expired`.
It only throws `QueryTimeoutError` if you pass your own `timeoutMs` and that
budget runs out first.

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
| `rotateApiKey()` | Rotate API key |
| `listConversations(params?)` | List conversations (paginated) |
| `listAllConversations(params?)` | Auto-paginate all conversations |
| `createConversation(input)` | Create a conversation |
| `getConversation(id)` | Get a conversation |
| `updateConversation(id, input)` | Update a conversation |
| `sendMessage(conversationId, input)` | Send a message |
| `listMessages(conversationId, params?)` | List messages (paginated) |
| `listAllMessages(conversationId, params?)` | Auto-paginate all messages |
| `inviteHuman(conversationId, input)` | Invite a human to a conversation |
| `listInvitations(conversationId)` | List invitations for a conversation |
| `revokeInvitation(invitationId)` | Revoke an invitation |
| `createWebhook(input)` | Create a webhook |
| `listWebhooks()` | List webhooks |
| `updateWebhook(id, input)` | Update a webhook |
| `deleteWebhook(id)` | Delete a webhook |
| `createQuery(input)` | Ask a human a question; returns immediately |
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
| `ValidationError` | 422 | Invalid input (check `.details`) |
| `RateLimitError` | 429 | Rate limited (auto-retried 3x) |
| `ServerError` | 500 | Server error |
| `QueryTimeoutError` | 408 | `waitForAnswer`'s own `timeoutMs` elapsed before the query was answered or expired |

`createQuery` and `clarifyQuery` also throw `ValidationError` when the
[admission gate](https://docs.agentdialog.io/docs/concepts/queries) refuses a
question a human could not decide — a subject with nothing to look at, a
risk above `low` with no stated consequences, and the like. `err.message`
carries the specific reason and what to add before retrying.

## License

MIT
