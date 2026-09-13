#!/usr/bin/env bun
/**
 * a2a-cli — drive an AgentDialog A2A agent from the command line.
 *
 * What an opencode instance (or any shell) needs to act as an A2A agent:
 * register itself, read its mailbox, update a task, deliver an artifact.
 * Agent keys are kept in a shared JSON file (A2A_KEYS_FILE), keyed by slug,
 * so several collaborating agents on one machine each use their own key.
 *
 * Usage:
 *   A2A_BASE_URL=https://api.agentdialog.io A2A_KEYS_FILE=.a2a-keys.json \
 *     bun scripts/a2a-cli.ts <command> ...
 *
 * Commands:
 *   register <slug> <displayName>            self-register (with a 12h lifetime)
 *   create-project <slug> <name>             lead creates a project
 *   invite <leadSlug> <projectId> <agentSlug>
 *   assign <leadSlug> <projectId> <assigneeSlug> <title> <message...>
 *   project <leadSlug> <projectId>           lead's view of the project
 *   inbox <slug>                             tasks addressed to this agent
 *   read <slug> <taskId>                     one task, messages + artifacts
 *   status <slug> <taskId> <STATE>           update the task state
 *   deliver <slug> <taskId> <name> <file...> attach files as a text artifact
 *   reply <slug> <taskId> <text...>          append a message
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = (process.env.A2A_BASE_URL || "https://api.agentdialog.io").replace(/\/$/, "");
const KEYS_FILE = process.env.A2A_KEYS_FILE || "./.a2a-keys.json";

interface AgentEntry {
  id: string;
  apiKey: string;
}

function loadKeys(): Record<string, AgentEntry> {
  if (!existsSync(KEYS_FILE)) return {};
  return JSON.parse(readFileSync(KEYS_FILE, "utf8"));
}

function saveKeys(keys: Record<string, AgentEntry>) {
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ ${res.status} ${path}:`, JSON.stringify(body));
    process.exit(1);
  }
  return body.data as any;
}

function authHeader(keys: Record<string, AgentEntry>, slug: string) {
  const entry = keys[slug];
  if (!entry) {
    console.error(`✗ no stored key for agent '${slug}' — run register first`);
    process.exit(1);
  }
  return { Authorization: `Bearer ${entry.apiKey}` };
}

function partsText(task: any): string {
  const lines: string[] = [];
  for (const m of task.messages ?? []) {
    for (const p of m.parts ?? []) {
      if (p.kind === "text") lines.push(`[${m.role}] ${p.text}`);
      else lines.push(`[${m.role}] ${JSON.stringify(p)}`);
    }
  }
  return lines.join("\n") || "(no messages)";
}

function artifactsText(task: any): string {
  const out: string[] = [];
  for (const a of task.artifacts ?? []) {
    out.push(`artifact: ${a.name ?? a.artifactId}`);
    for (const p of a.parts ?? []) {
      if (p.kind === "text") out.push(p.text);
      else out.push(JSON.stringify(p));
    }
  }
  return out.join("\n") || "(no artifacts)";
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "register": {
    const [slug, displayName] = args;
    const data = await api("/api/v1/agent/register", {
      method: "POST",
      body: JSON.stringify({ slug, displayName, expiresInMinutes: 720 }),
    });
    const keys = loadKeys();
    keys[slug] = { id: data.id, apiKey: data.apiKey };
    saveKeys(keys);
    console.log(`✓ registered ${slug} (${data.id}) — key stored`);
    break;
  }

  case "create-project": {
    const [slug, ...nameParts] = args;
    const name = nameParts.join(" ");
    const keys = loadKeys();
    const data = await api("/api/v1/agent/projects", {
      method: "POST",
      headers: authHeader(keys, slug),
      body: JSON.stringify({ name }),
    });
    console.log(data.project_id);
    break;
  }

  case "invite": {
    const [leadSlug, projectId, agentSlug] = args;
    const keys = loadKeys();
    const target = keys[agentSlug];
    if (!target) {
      console.error(`✗ no stored key for agent '${agentSlug}'`);
      process.exit(1);
    }
    await api(`/api/v1/agent/projects/${projectId}/participants`, {
      method: "POST",
      headers: authHeader(keys, leadSlug),
      body: JSON.stringify({ agent_id: target.id }),
    });
    console.log(`✓ ${agentSlug} invited to ${projectId}`);
    break;
  }

  case "assign": {
    const [leadSlug, projectId, assigneeSlug, title, ...msg] = args;
    const keys = loadKeys();
    const target = keys[assigneeSlug];
    if (!target) {
      console.error(`✗ no stored key for agent '${assigneeSlug}'`);
      process.exit(1);
    }
    await api(`/api/v1/agent/projects/${projectId}/tasks`, {
      method: "POST",
      headers: authHeader(keys, leadSlug),
      body: JSON.stringify({ assignee_agent_id: target.id, title, message: msg.join(" ") }),
    });
    console.log(`✓ task assigned to ${assigneeSlug}: ${title}`);
    break;
  }

  case "project": {
    const [slug, projectId] = args;
    const keys = loadKeys();
    const data = await api(`/api/v1/agent/projects/${projectId}`, {
      headers: authHeader(keys, slug),
    });
    console.log(`project: ${data.name} — status: ${data.status}`);
    for (const t of data.tasks ?? []) {
      console.log(`  task ${t.a2a_task_id}: ${t.title} — ${t.status}`);
    }
    break;
  }

  case "inbox": {
    const [slug] = args;
    const keys = loadKeys();
    const tasks = await api("/api/v1/agent/a2a/tasks", { headers: authHeader(keys, slug) });
    if (tasks.length === 0) {
      console.log("(empty)");
      break;
    }
    for (const t of tasks) {
      console.log(`${t.id}  ${t.status.state}`);
    }
    break;
  }

  case "read": {
    const [slug, taskId] = args;
    const keys = loadKeys();
    const task = await api(`/api/v1/agent/a2a/tasks/${taskId}`, { headers: authHeader(keys, slug) });
    console.log(`task ${task.id} — ${task.status.state}`);
    console.log("── messages ──");
    console.log(partsText(task));
    console.log("── artifacts ──");
    console.log(artifactsText(task));
    break;
  }

  case "status": {
    const [slug, taskId, state] = args;
    const keys = loadKeys();
    await api(`/api/v1/agent/a2a/tasks/${taskId}/status`, {
      method: "POST",
      headers: authHeader(keys, slug),
      body: JSON.stringify({ state }),
    });
    console.log(`✓ ${state}`);
    break;
  }

  case "deliver": {
    const [slug, taskId, name, ...files] = args;
    const keys = loadKeys();
    const parts = files.map((f) => {
      const content = readFileSync(f, "utf8");
      return `=== ${f} ===\n${content}`;
    });
    await api(`/api/v1/agent/a2a/tasks/${taskId}/artifacts`, {
      method: "POST",
      headers: authHeader(keys, slug),
      body: JSON.stringify({ name, parts: [{ kind: "text", text: parts.join("\n") }] }),
    });
    console.log(`✓ delivered ${name} (${files.length} file(s))`);
    break;
  }

  case "reply": {
    const [slug, taskId, ...text] = args;
    const keys = loadKeys();
    await api(`/api/v1/agent/a2a/tasks/${taskId}/messages`, {
      method: "POST",
      headers: authHeader(keys, slug),
      body: JSON.stringify({ role: "agent", parts: [{ kind: "text", text: text.join(" ") }] }),
    });
    console.log("✓ replied");
    break;
  }

  default:
    console.error(`Unknown command: ${cmd ?? "(none)"}`);
    console.error("See the header of this file for usage.");
    process.exit(1);
}