import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * The owner surface: the authenticated agent is the mailbox owner, so every
 * operation is scoped by its id. A task addressed to agent B must be invisible
 * and untouchable to agent C, even though both are legitimate API-key holders.
 */

const app = createTestApp();

async function createTaskFor(sender: { authHeader: string }, recipient: { authHeader: string; agent: { slug: string } }) {
  const res = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
    body: JSON.stringify({ message: { role: "user", parts: [{ kind: "text", text: "Build the API" }] } }),
  });
  return res.json();
}

describe("A2A owner mailbox", () => {
  it("lists, reads and updates tasks addressed to the owner", async () => {
    const sender = await createTestAgent();
    const owner = await createTestAgent();
    const task = await createTaskFor(sender, owner);

    const list = await app.request("/api/v1/agent/a2a/tasks", {
      headers: { Authorization: owner.authHeader },
    });
    expect(list.status).toBe(200);
    const { data: tasks } = await list.json();
    expect(tasks.map((t: any) => t.id)).toContain(task.id);

    const get = await app.request(`/api/v1/agent/a2a/tasks/${task.id}`, {
      headers: { Authorization: owner.authHeader },
    });
    expect(get.status).toBe(200);

    const status = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: owner.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_WORKING" }),
    });
    expect(status.status).toBe(200);
    const { data: working } = await status.json();
    expect(working.status.state).toBe("TASK_STATE_WORKING");

    const artifact = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: owner.authHeader },
      body: JSON.stringify({ name: "spec.md", parts: [{ kind: "text", text: "# Spec" }] }),
    });
    expect(artifact.status).toBe(201);

    const message = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: owner.authHeader },
      body: JSON.stringify({ role: "agent", parts: [{ kind: "text", text: "On it" }] }),
    });
    expect(message.status).toBe(201);

    const complete = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: owner.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_COMPLETED" }),
    });
    const { data: done } = await complete.json();
    expect(done.status.state).toBe("TASK_STATE_COMPLETED");
  });

  it("lets the owner cancel a task", async () => {
    const sender = await createTestAgent();
    const owner = await createTestAgent();
    const task = await createTaskFor(sender, owner);

    const cancel = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { Authorization: owner.authHeader },
    });
    expect(cancel.status).toBe(200);
    const { data: canceled } = await cancel.json();
    expect(canceled.status.state).toBe("TASK_STATE_CANCELED");
  });

  it("does not let a third agent touch the owner's mailbox", async () => {
    const sender = await createTestAgent();
    const owner = await createTestAgent();
    const stranger = await createTestAgent();
    const task = await createTaskFor(sender, owner);

    const get = await app.request(`/api/v1/agent/a2a/tasks/${task.id}`, {
      headers: { Authorization: stranger.authHeader },
    });
    expect(get.status).toBe(403);

    const status = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: stranger.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_COMPLETED" }),
    });
    expect(status.status).toBe(403);

    const cancel = await app.request(`/api/v1/agent/a2a/tasks/${task.id}/cancel`, {
      method: "POST",
      headers: { Authorization: stranger.authHeader },
    });
    expect(cancel.status).toBe(403);
  });

  it("does not leak another agent's mailbox in the list", async () => {
    const sender = await createTestAgent();
    const owner = await createTestAgent();
    const other = await createTestAgent();
    await createTaskFor(sender, owner);

    const list = await app.request("/api/v1/agent/a2a/tasks", {
      headers: { Authorization: other.authHeader },
    });
    const { data: tasks } = await list.json();
    expect(tasks).toHaveLength(0);
  });
});