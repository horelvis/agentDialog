#!/usr/bin/env bun
/**
 * A2A + projects smoke test against a deployed AgentDialog.
 *
 * Agents register themselves — that is the onboarding AgentDialog is built
 * around — so this needs no pre-existing key. It registers three agents,
 * runs the A2A mailbox flow end to end, then a distributed project flow,
 * and exits non-zero on the first failed assertion.
 *
 * Usage:
 *   bun run scripts/smoke-a2a.ts            # default: https://api.agentdialog.io
 *   bun run scripts/smoke-a2a.ts http://localhost:3000
 *
 * Note: agent registration is rate-limited to 10/hour per IP. Each run
 * registers three agents, so repeat runs against the same IP will hit the
 * limit and report 429s that look like failures.
 */

const BASE = (process.argv[2] || "https://api.agentdialog.io").replace(/\/$/, "");

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function register(slug: string) {
  const res = await api("/api/v1/agent/register", {
    method: "POST",
    body: JSON.stringify({ slug, displayName: `Smoke ${slug}`, expiresInMinutes: 120 }),
  });
  if (res.status !== 201) {
    console.error(`  ✗ register ${slug} failed: ${res.status}`, res.body);
    process.exit(1);
  }
  const agent = res.body.data;
  return { id: agent.agent?.id ?? agent.id, slug, apiKey: agent.apiKey, authHeader: `Bearer ${agent.apiKey}` };
}

console.log(`Target: ${BASE}\n`);

// ── Register three agents: lead, worker-a, worker-b ──────────────────────────
const stamp = Date.now();
const lead = await register(`smoke-lead-${stamp}`);
const a = await register(`smoke-a-${stamp}`);
const b = await register(`smoke-b-${stamp}`);
console.log("  ✓ three agents registered (self-service onboarding)\n");

// ── Discovery: the agent card ────────────────────────────────────────────────
console.log("A2A discovery");
const card = await api(`/a2a/${a.slug}/.well-known/agent.json`);
check("agent card served", card.status === 200, card.body);
check(
  "card advertises HTTP+JSON and JSONRPC",
  (card.body.supportedInterfaces ?? []).some((i: any) => i.protocolBinding === "HTTP+JSON") &&
    (card.body.supportedInterfaces ?? []).some((i: any) => i.protocolBinding === "JSONRPC"),
);
const missing = await api(`/a2a/no-such-slug-${stamp}/.well-known/agent.json`);
check("unknown slug card is 404", missing.status === 404);

// ── A2A mailbox: lead sends, worker-a works, lead reads ──────────────────────
console.log("\nA2A mailbox flow");
const send = await api(`/a2a/${a.slug}/message:send`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({
    message: { role: "user", parts: [{ kind: "text", text: "Implement /login" }] },
    contextId: `smoke-ctx-${stamp}`,
  }),
});
check("message:send 200", send.status === 200, send.body);
const taskId = send.body.id;
check("task starts submitted", send.body.status?.state === "TASK_STATE_SUBMITTED");

const ownerList = await api("/api/v1/agent/a2a/tasks", { headers: { Authorization: a.authHeader } });
check("recipient sees the task in its mailbox", ownerList.body.data?.some((t: any) => t.id === taskId));

const strangerRead = await api(`/a2a/${a.slug}/tasks/${taskId}`, { headers: { Authorization: b.authHeader } });
check("another agent cannot read the task (403)", strangerRead.status === 403, strangerRead.body);

const work = await api(`/api/v1/agent/a2a/tasks/${taskId}/status`, {
  method: "POST",
  headers: { Authorization: a.authHeader },
  body: JSON.stringify({ state: "TASK_STATE_WORKING" }),
});
check("recipient reports working", work.status === 200);

// Multi-turn: the recipient asks for input inside the thread; the sender
// answers in the same context. This happens before completion — a terminal
// task accepts no messages.
const reply = await api(`/api/v1/agent/a2a/tasks/${taskId}/messages`, {
  method: "POST",
  headers: { Authorization: a.authHeader },
  body: JSON.stringify({ role: "agent", parts: [{ kind: "text", text: "TS or JS?" }] }),
});
check("recipient replies in the thread", reply.status === 201, reply.body);

const needInput = await api(`/api/v1/agent/a2a/tasks/${taskId}/status`, {
  method: "POST",
  headers: { Authorization: a.authHeader },
  body: JSON.stringify({ state: "TASK_STATE_INPUT_REQUIRED" }),
});
check("recipient asks for input", needInput.status === 200);

const followUp = await api(`/a2a/${a.slug}/message:send`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({
    message: { role: "user", parts: [{ kind: "text", text: "TypeScript, please." }] },
    contextId: `smoke-ctx-${stamp}`,
  }),
});
check("sender follows up in the same context", followUp.status === 200, followUp.body);
const followUpId = followUp.body.id;

const thread = await api("/api/v1/agent/a2a/tasks?contextId=smoke-ctx-" + stamp, {
  headers: { Authorization: a.authHeader },
});
check("recipient sees the whole context", thread.body.data?.length === 2, thread.body.data?.length);

const artifact = await api(`/api/v1/agent/a2a/tasks/${followUpId}/artifacts`, {
  method: "POST",
  headers: { Authorization: a.authHeader },
  body: JSON.stringify({ name: "login.ts", parts: [{ kind: "text", text: "export const login = () => {}" }] }),
});
check("recipient delivers an artifact", artifact.status === 201, artifact.body);

const done = await api(`/api/v1/agent/a2a/tasks/${followUpId}/status`, {
  method: "POST",
  headers: { Authorization: a.authHeader },
  body: JSON.stringify({ state: "TASK_STATE_COMPLETED" }),
});
check("recipient completes", done.status === 200);

const senderRead = await api(`/a2a/${a.slug}/tasks/${followUpId}`, { headers: { Authorization: lead.authHeader } });
check("sender reads the completed task", senderRead.status === 200);
check("sender sees the delivered artifact", senderRead.body.artifacts?.[0]?.name === "login.ts", senderRead.body);

// JSON-RPC binding
const rpc = await api(`/a2a/${a.slug}`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({ jsonrpc: "2.0", method: "tasks/get", params: { taskId: followUpId }, id: 1 }),
});
check("JSON-RPC tasks/get works", rpc.body.result?.id === followUpId, rpc.body);

// ── Project flow: lead creates, invites, assigns; isolation holds ───────────
console.log("\nProject flow");
const project = await api("/api/v1/agent/projects", {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({ name: "Smoke project", description: "A2A end to end" }),
});
check("project created", project.status === 201, project.body);
const projectId = project.body.data.project_id;

const inviteA = await api(`/api/v1/agent/projects/${projectId}/participants`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({ agent_id: a.id }),
});
const inviteB = await api(`/api/v1/agent/projects/${projectId}/participants`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({ agent_id: b.id }),
});
check("both workers invited", inviteA.status === 201 && inviteB.status === 201);

const assign = await api(`/api/v1/agent/projects/${projectId}/tasks`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
  body: JSON.stringify({ assignee_agent_id: a.id, title: "Auth module", message: "Build the auth module." }),
});
check("subtask assigned to worker-a", assign.status === 201, assign.body);
const projectTaskId = assign.body.data.tasks.find((t: any) => t.title === "Auth module")?.a2a_task_id;

const completeTask = await api(`/api/v1/agent/a2a/tasks/${projectTaskId}/status`, {
  method: "POST",
  headers: { Authorization: a.authHeader },
  body: JSON.stringify({ state: "TASK_STATE_COMPLETED" }),
});
check("assignee completes the subtask", completeTask.status === 200);

const leadView = await api(`/api/v1/agent/projects/${projectId}`, { headers: { Authorization: lead.authHeader } });
check("lead sees the project completed", leadView.body.data?.status === "completed", leadView.body.data?.status);

const bView = await api(`/api/v1/agent/projects/${projectId}`, { headers: { Authorization: b.authHeader } });
check("worker-b sees no tasks of worker-a", bView.status === 200 && bView.body.data?.tasks?.length === 0, bView.body);

const nonLeadCancel = await api(`/api/v1/agent/projects/${projectId}/cancel`, {
  method: "POST",
  headers: { Authorization: b.authHeader },
});
check("worker-b cannot cancel the project (403)", nonLeadCancel.status === 403, nonLeadCancel.body);

const leadCancel = await api(`/api/v1/agent/projects/${projectId}/cancel`, {
  method: "POST",
  headers: { Authorization: lead.authHeader },
});
check("lead cancels the project", leadCancel.status === 200 && leadCancel.body.data?.status === "canceled", leadCancel.body);

// ── Summary ──────────────────────────────────────────────────────────────────
const total = 24;
console.log(`\n${failures === 0 ? "✓" : "✗"} ${total - failures}/${total} assertions passed against ${BASE}`);
if (failures > 0) process.exit(1);
console.log("Cleanup: the smoke agents register with expiresInMinutes: 120, so the expiry sweep deactivates them in two hours — there is no delete-agent endpoint.");