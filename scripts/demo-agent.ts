#!/usr/bin/env bun
/**
 * Demo Agent Script — Tests the full AgentDialog platform flow.
 *
 * Usage:
 *   bun run demo                        # default email
 *   bun run demo user@example.com       # custom email
 *
 * Environment:
 *   DEMO_API_URL — API base URL (default: https://api.agentdialog.io)
 */

const API_URL = (process.env.DEMO_API_URL || "https://api.agentdialog.io").replace(/\/$/, "");
const EMAIL = process.argv[2] || "demo@agentdialog.io";
const TIMESTAMP = Date.now();
const SLUG = `demo-bot-${TIMESTAMP}`;

// ── Colors ──────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function step(n: number, label: string) {
  console.log(`\n${c.bold}${c.cyan}[${n}/12]${c.reset} ${c.bold}${label}${c.reset}`);
}

function ok(msg: string) {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

function fail(msg: string) {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}

function info(msg: string) {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  raw: unknown;
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const errMsg =
        (json && typeof json === "object" && "error" in json && typeof json.error === "string"
          ? json.error
          : null) ??
        (json && typeof json === "object" && "message" in json && typeof json.message === "string"
          ? json.message
          : null) ??
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: errMsg, raw: json };
    }

    const data = json && typeof json === "object" && "data" in json ? (json.data as T) : (json as T);
    return { ok: true, status: res.status, data, raw: json };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: msg, raw: null };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}${c.magenta}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║   AgentDialog — Full Platform Demo       ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════╝${c.reset}`);
  console.log();
  info(`API:   ${API_URL}`);
  info(`Email: ${EMAIL}`);
  info(`Slug:  ${SLUG}`);

  let apiKey = "";
  let agentId = "";
  let conversationId = "";
  let messageIds: string[] = [];
  let invitationId = "";
  let passed = 0;
  let failed = 0;

  // ── 1. Register agent ───────────────────────────────────────────────────

  step(1, "Register agent");
  const reg = await api<{
    id: string;
    slug: string;
    apiKey: string;
    displayName: string;
    capabilities: string[];
  }>("POST", "/api/v1/agent/register", {
    slug: SLUG,
    displayName: "Demo Bot",
    description: "Automated demo agent for platform testing",
    provider: "demo-script",
    model: "demo-v1",
    capabilities: ["text", "tool_use", "forms", "approvals", "notifications"],
    metadata: { purpose: "e2e-demo", createdAt: new Date().toISOString() },
  });

  if (reg.ok && reg.data) {
    apiKey = reg.data.apiKey;
    agentId = reg.data.id;
    ok(`Agent registered: ${reg.data.slug} (${agentId})`);
    info(`API key prefix: ${apiKey.slice(0, 16)}...`);
    passed++;
  } else {
    fail(`Registration failed: ${reg.error}`);
    console.log(`\n${c.red}Cannot continue without an agent. Exiting.${c.reset}`);
    process.exit(1);
    return; // unreachable, helps TS
  }

  // ── 2. Get profile ─────────────────────────────────────────────────────

  step(2, "Get profile");
  const profile = await api<{ id: string; slug: string; capabilities: string[] }>(
    "GET",
    "/api/v1/agent/me",
    undefined,
    apiKey,
  );

  if (profile.ok && profile.data) {
    ok(`Profile: ${profile.data.slug} — capabilities: [${profile.data.capabilities.join(", ")}]`);
    passed++;
  } else {
    fail(`Get profile failed: ${profile.error}`);
    failed++;
  }

  // ── 3. Create conversation ──────────────────────────────────────────────

  step(3, "Create conversation");
  const conv = await api<{ id: string; title: string }>(
    "POST",
    "/api/v1/agent/conversations",
    {
      title: "Demo: Full Platform Test",
      description: "End-to-end test of all message types and platform capabilities",
      intentType: "notification",
      context: { demo: true, timestamp: TIMESTAMP },
    },
    apiKey,
  );

  if (conv.ok && conv.data) {
    conversationId = conv.data.id;
    ok(`Conversation created: ${conversationId}`);
    info(`Title: ${conv.data.title}`);
    passed++;
  } else {
    fail(`Create conversation failed: ${conv.error}`);
    console.log(`\n${c.red}Cannot continue without a conversation. Exiting.${c.reset}`);
    process.exit(1);
    return;
  }

  // ── 4. Send text message ────────────────────────────────────────────────

  step(4, "Send text message");
  const textMsg = await api<{ id: string; type: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/messages`,
    {
      type: "text",
      content: "Hello! This is a demo of the AgentDialog platform. I will now showcase all supported message types.",
    },
    apiKey,
  );

  if (textMsg.ok && textMsg.data) {
    messageIds.push(textMsg.data.id);
    ok(`Text message sent: ${textMsg.data.id}`);
    passed++;
  } else {
    fail(`Send text failed: ${textMsg.error}`);
    failed++;
  }

  // ── 5. Send notification ────────────────────────────────────────────────

  step(5, "Send notification");
  const notif = await api<{ id: string; type: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/messages`,
    {
      type: "notification",
      content: "Deployment pipeline completed successfully.",
      structuredData: {
        severity: "info",
        title: "Deployment Complete",
        details: "Environment: staging — Duration: 2m 34s",
      },
    },
    apiKey,
  );

  if (notif.ok && notif.data) {
    messageIds.push(notif.data.id);
    ok(`Notification sent: ${notif.data.id}`);
    passed++;
  } else {
    fail(`Send notification failed: ${notif.error}`);
    failed++;
  }

  // ── 6. Send tool_call ───────────────────────────────────────────────────

  step(6, "Send tool_call");
  const toolCall = await api<{ id: string; type: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/messages`,
    {
      type: "tool_call",
      content: "Executing database health check...",
      structuredData: {
        toolName: "db_health_check",
        toolInput: { host: "db.example.com", port: 5432, timeout: 5000 },
      },
    },
    apiKey,
  );

  let toolCallId: string | undefined;
  if (toolCall.ok && toolCall.data) {
    toolCallId = toolCall.data.id;
    messageIds.push(toolCall.data.id);
    ok(`Tool call sent: ${toolCall.data.id}`);
    passed++;
  } else {
    fail(`Send tool_call failed: ${toolCall.error}`);
    failed++;
  }

  // ── 7. Send tool_result ─────────────────────────────────────────────────

  step(7, "Send tool_result");
  const toolResult = await api<{ id: string; type: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/messages`,
    {
      type: "tool_result",
      content: "Database health check passed.",
      structuredData: {
        toolCallId: toolCallId ?? "00000000-0000-0000-0000-000000000000",
        output: {
          latency: "12ms",
          connections: 42,
          uptime: "99.97%",
          version: "PostgreSQL 16.1",
        },
        durationMs: 120,
      },
    },
    apiKey,
  );

  if (toolResult.ok && toolResult.data) {
    messageIds.push(toolResult.data.id);
    ok(`Tool result sent: ${toolResult.data.id}`);
    passed++;
  } else {
    fail(`Send tool_result failed: ${toolResult.error}`);
    failed++;
  }

  // ── 8. Send form ────────────────────────────────────────────────────────

  step(8, "Send form");
  const form = await api<{ id: string; type: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/messages`,
    {
      type: "form",
      content: "Please fill out the deployment configuration:",
      structuredData: {
        formId: `deploy-config-${TIMESTAMP}`,
        title: "Deployment Configuration",
        fields: [
          { name: "environment", type: "select", label: "Environment", options: ["staging", "production"], required: true },
          { name: "replicas", type: "number", label: "Number of Replicas", defaultValue: 3 },
          { name: "notify_team", type: "checkbox", label: "Notify team on completion", defaultValue: true },
          { name: "notes", type: "textarea", label: "Deployment Notes" },
        ],
      },
    },
    apiKey,
  );

  if (form.ok && form.data) {
    messageIds.push(form.data.id);
    ok(`Form sent: ${form.data.id}`);
    passed++;
  } else {
    fail(`Send form failed: ${form.error}`);
    failed++;
  }

  // ── 9. Send approval ───────────────────────────────────────────────────

  step(9, "Send approval request");
  const approval = await api<{ id: string; type: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/messages`,
    {
      type: "approval",
      content: "Production deployment requires approval. This will deploy v2.5.0 to all production servers.",
      structuredData: {
        approvalId: `deploy-approval-${TIMESTAMP}`,
        action: "deploy-v2.5.0-production",
        riskLevel: "high",
        details: "Deploy v2.5.0 to 12 production servers (rolling deploy, auto-rollback on failure)",
      },
    },
    apiKey,
  );

  if (approval.ok && approval.data) {
    messageIds.push(approval.data.id);
    ok(`Approval request sent: ${approval.data.id}`);
    passed++;
  } else {
    fail(`Send approval failed: ${approval.error}`);
    failed++;
  }

  // ── 10. List messages ──────────────────────────────────────────────────

  step(10, "List messages");
  const msgs = await api<Array<{ id: string; type: string }>>(
    "GET",
    `/api/v1/agent/conversations/${conversationId}/messages?limit=50`,
    undefined,
    apiKey,
  );

  if (msgs.ok && msgs.data) {
    ok(`Retrieved ${msgs.data.length} messages`);
    const types = msgs.data.map((m) => m.type);
    info(`Types: ${types.join(", ")}`);
    passed++;
  } else {
    fail(`List messages failed: ${msgs.error}`);
    failed++;
  }

  // ── 11. Invite human ──────────────────────────────────────────────────

  step(11, "Invite human");
  const invite = await api<{ id: string; invitedHumanEmail: string; token: string; status: string }>(
    "POST",
    `/api/v1/agent/conversations/${conversationId}/invitations`,
    {
      email: EMAIL,
      message: "You are invited to review the demo conversation and approve the deployment.",
      expiresInHours: 48,
    },
    apiKey,
  );

  if (invite.ok && invite.data) {
    invitationId = invite.data.id;
    ok(`Invitation sent to ${invite.data.invitedHumanEmail}`);
    info(`Invitation ID: ${invitationId} — Status: ${invite.data.status}`);
    passed++;
  } else {
    fail(`Invite human failed: ${invite.error}`);
    failed++;
  }

  // ── 12. Get conversation ──────────────────────────────────────────────

  step(12, "Get conversation (with participants)");
  const convDetail = await api<{
    id: string;
    title: string;
    status: string;
    participants: Array<{ actorType: string; displayName: string; role: string }>;
  }>("GET", `/api/v1/agent/conversations/${conversationId}`, undefined, apiKey);

  if (convDetail.ok && convDetail.data) {
    ok(`Conversation: ${convDetail.data.title} [${convDetail.data.status}]`);
    for (const p of convDetail.data.participants ?? []) {
      info(`  ${p.actorType} — ${p.displayName} (${p.role})`);
    }
    passed++;
  } else {
    fail(`Get conversation failed: ${convDetail.error}`);
    failed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────

  console.log();
  console.log(`${c.bold}${c.magenta}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║               Summary                    ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════╝${c.reset}`);
  console.log();
  console.log(`  ${c.bold}Results:${c.reset}  ${c.green}${passed} passed${c.reset}  ${failed > 0 ? `${c.red}${failed} failed${c.reset}` : ""}`);
  console.log();
  console.log(`  ${c.bold}IDs created:${c.reset}`);
  console.log(`    ${c.blue}Agent:${c.reset}          ${agentId}`);
  console.log(`    ${c.blue}Conversation:${c.reset}   ${conversationId}`);
  if (invitationId) {
    console.log(`    ${c.blue}Invitation:${c.reset}     ${invitationId}`);
  }
  console.log(`    ${c.blue}Messages (${messageIds.length}):${c.reset}`);
  for (const id of messageIds) {
    console.log(`      - ${id}`);
  }
  console.log();

  if (failed > 0) {
    console.log(`  ${c.yellow}⚠ Some steps failed. Check output above for details.${c.reset}`);
    process.exit(1);
  } else {
    console.log(`  ${c.green}All steps completed successfully!${c.reset}`);
  }
}

main().catch((err) => {
  console.error(`\n${c.red}Fatal error:${c.reset}`, err);
  process.exit(1);
});
