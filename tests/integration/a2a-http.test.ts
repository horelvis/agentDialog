import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * The public A2A surface of one agent, addressed by slug. Authentication is the
 * sender's own API key; the recipient is resolved from the slug and the sender
 * can only touch tasks it created.
 */

const app = createTestApp();

async function setupPair() {
  const sender = await createTestAgent();
  const recipient = await createTestAgent();
  return { sender, recipient };
}

describe("A2A discovery", () => {
  it("serves the agent card with both bindings", async () => {
    const { recipient } = await setupPair();
    const res = await app.request(`/a2a/${recipient.agent.slug}/.well-known/agent.json`);
    expect(res.status).toBe(200);

    const card = await res.json();
    expect(card.name).toBe("Test Agent");
    expect(card.supportedInterfaces.map((i: any) => i.protocolBinding)).toEqual(
      expect.arrayContaining(["HTTP+JSON", "JSONRPC"]),
    );
    expect(card.supportedInterfaces[0].url).toContain(`/a2a/${recipient.agent.slug}`);
    expect(card.securitySchemes.agentdialog_api_key.type).toBe("apiKey");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await app.request("/a2a/no-such-agent/.well-known/agent.json");
    expect(res.status).toBe(404);
  });
});

describe("A2A message:send", () => {
  it("drops a task into the recipient's mailbox", async () => {
    const { sender, recipient } = await setupPair();

    const res = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({
        message: { role: "user", parts: [{ kind: "text", text: "Implement the login endpoint" }] },
        metadata: { project: "auth" },
      }),
    });

    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task.id).toBeString();
    expect(task.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(task.messages[0].parts[0].text).toBe("Implement the login endpoint");
  });

  it("rejects an unauthenticated sender", async () => {
    const { recipient } = await setupPair();
    const res = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "hi" }] } }),
    });
    expect(res.status).toBe(401);
  });
});

describe("A2A task access", () => {
  it("lets the sender read its own task but not another agent's", async () => {
    const { sender, recipient } = await setupPair();
    const stranger = await createTestAgent();

    const create = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "secret work" }] } }),
    });
    const task = await create.json();

    const own = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}`, {
      headers: { Authorization: sender.authHeader },
    });
    expect(own.status).toBe(200);

    const steal = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}`, {
      headers: { Authorization: stranger.authHeader },
    });
    expect(steal.status).toBe(403);
  });

  it("lists only the sender's tasks", async () => {
    const { sender, recipient } = await setupPair();
    const otherSender = await createTestAgent();

    await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: otherSender.authHeader },
      body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "mine" }] } }),
    });

    const res = await app.request(`/a2a/${recipient.agent.slug}/tasks`, {
      headers: { Authorization: sender.authHeader },
    });
    expect(res.status).toBe(200);
    const tasks = await res.json();
    expect(tasks).toHaveLength(0);
  });

  it("cancels a task as the sender", async () => {
    const { sender, recipient } = await setupPair();
    const create = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "do it" }] } }),
    });
    const task = await create.json();

    const cancel = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}:cancel`, {
      method: "POST",
      headers: { Authorization: sender.authHeader },
    });
    expect(cancel.status).toBe(200);
    const canceled = await cancel.json();
    expect(canceled.status.state).toBe("TASK_STATE_CANCELED");
  });
});

describe("A2A project push configs", () => {
  it("registers, reads and deletes the caller's project callback", async () => {
    const lead = await createTestAgent();
    const member = await createTestAgent();

    const created = await app.request("/api/v1/agent/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ name: "Shared work" }),
    });
    const { data: project } = await created.json();

    await app.request(`/api/v1/agent/projects/${project.project_id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ agent_id: member.agent.id }),
    });

    const add = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: member.authHeader },
      body: JSON.stringify({ url: "https://public.example.com/hook", authInfo: { type: "bearer", token: "secret" } }),
    });
    expect(add.status).toBe(200);
    const config = await add.json();
    expect(config.data.url).toBe("https://public.example.com/hook");

    const get = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      headers: { Authorization: member.authHeader },
    });
    expect(get.status).toBe(200);
    const own = await get.json();
    expect(own.data.url).toBe("https://public.example.com/hook");

    const del = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      method: "DELETE",
      headers: { Authorization: member.authHeader },
    });
    expect(del.status).toBe(200);
  });

  it("refuses a non-participant and an invalid URL", async () => {
    const lead = await createTestAgent();
    const outsider = await createTestAgent();

    const created = await app.request("/api/v1/agent/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ name: "Private" }),
    });
    const { data: project } = await created.json();

    const forbidden = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: outsider.authHeader },
      body: JSON.stringify({ url: "https://public.example.com/hook" }),
    });
    expect(forbidden.status).toBe(403);

    const badScheme = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ url: "ftp://public.example.com/hook" }),
    });
    expect(badScheme.status).toBe(422);
  });
});

describe("A2A project contract", () => {
  it("serves the contract to a participant who holds the share token", async () => {
    const lead = await createTestAgent();
    const member = await createTestAgent();

    const created = await app.request("/api/v1/agent/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ name: "Shared work" }),
    });
    const { data: project } = await created.json();

    await app.request(`/api/v1/agent/projects/${project.project_id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ agent_id: member.agent.id }),
    });

    await app.request(`/api/v1/agent/projects/${project.project_id}/contract-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ markdown: "# Rules\n\n- always test" }),
    });

    const share = await app.request(`/api/v1/agent/projects/${project.project_id}/share`, {
      method: "POST",
      headers: { Authorization: lead.authHeader },
    });
    expect(share.status).toBe(200);
    const { data: shareData } = await share.json();

    const contract = await app.request(shareData.share_url);
    expect(contract.status).toBe(200);
    const body = await contract.json();

    expect(body.projectId).toBe(project.project_id);
    expect(body.specVersion).toBe("1.0");
    expect(body.lead.slug).toBe(lead.agent.slug);
    expect(body.participants.map((p: any) => p.slug)).toContain(member.agent.slug);
    expect(body.rules).toContain("always test");
    expect(body.hub.notificationEndpoint).toBe(`/api/v1/agent/projects/${project.project_id}/push`);
  });

  it("refuses a contract fetch without a valid token", async () => {
    const lead = await createTestAgent();
    const created = await app.request("/api/v1/agent/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ name: "Private" }),
    });
    const { data: project } = await created.json();

    const noToken = await app.request(`/a2a/projects/${project.project_id}/contract`);
    expect(noToken.status).toBe(401);

    const badToken = await app.request(`/a2a/projects/${project.project_id}/contract?token=a2p_bogus`);
    expect(badToken.status).toBe(401);
  });
});