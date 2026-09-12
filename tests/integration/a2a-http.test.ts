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

describe("A2A push configs", () => {
  it("creates, lists, gets and deletes a push config as the sender", async () => {
    const { sender, recipient } = await setupPair();
    const create = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "do it" }] } }),
    });
    const task = await create.json();

    const add = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}/pushNotificationConfigs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ url: "https://public.example.com/hook", authInfo: { type: "bearer", token: "secret" } }),
    });
    expect(add.status).toBe(201);
    const config = await add.json();

    const list = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}/pushNotificationConfigs`, {
      headers: { Authorization: sender.authHeader },
    });
    const configs = await list.json();
    expect(configs.map((c: any) => c.id)).toContain(config.id);

    const get = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}/pushNotificationConfigs/${config.id}`, {
      headers: { Authorization: sender.authHeader },
    });
    expect(get.status).toBe(200);

    const del = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}/pushNotificationConfigs/${config.id}`, {
      method: "DELETE",
      headers: { Authorization: sender.authHeader },
    });
    expect(del.status).toBe(204);
  });

  it("rejects a loopback push URL", async () => {
    const { sender, recipient } = await setupPair();
    const create = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "do it" }] } }),
    });
    const task = await create.json();

    const add = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}/pushNotificationConfigs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ url: "ftp://public.example.com/hook" }),
    });
    expect(add.status).toBe(422);
  });
});