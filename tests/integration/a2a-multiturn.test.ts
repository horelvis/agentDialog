import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * Collaboration must survive the isolation guarantees: the sender and the
 * recipient are different, protected actors, and still have to work the same
 * task. This proves the multi-turn loop end to end — including that a reply
 * from the recipient actually reaches the sender as a push notification.
 */

const app = createTestApp();

let received: Array<{ event: string; payload: unknown }> = [];
let server: ReturnType<typeof Bun.serve>;
let hookUrl: string;

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      if (req.method === "POST") {
        received.push(await req.json());
        return new Response("ok");
      }
      return new Response("not found", { status: 404 });
    },
  });
  hookUrl = `http://localhost:${server.port}/hook`;
});

afterAll(() => server.stop(true));

describe("multi-turn A2A collaboration", () => {
  it("sends a task, the recipient replies, and the sender is notified and follows up", async () => {
    const sender = await createTestAgent();
    const recipient = await createTestAgent();
    received = [];

    // 1. Sender drops a task, in a shared context, and registers a webhook.
    const send = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({
        message: { role: "user", parts: [{ kind: "text", text: "Implement /login" }] },
        contextId: "req-auth",
      }),
    });
    expect(send.status).toBe(200);
    const task = await send.json();

    const hook = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}/pushNotificationConfigs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ url: hookUrl, authInfo: { type: "bearer", token: "hook-secret" } }),
    });
    expect(hook.status).toBe(201);

    // 2. The recipient starts, replies with a message, and asks for input.
    await app.request(`/api/v1/agent/a2a/tasks/${task.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_WORKING" }),
    });

    await app.request(`/api/v1/agent/a2a/tasks/${task.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ role: "agent", parts: [{ kind: "text", text: "TS or JS?" }] }),
    });

    await app.request(`/api/v1/agent/a2a/tasks/${task.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_INPUT_REQUIRED" }),
    });

    // 3. The reply reached the sender's webhook before anything else was sent.
    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((e) => e.event === "task_message")).toBe(true);

    // 4. The sender reads the task and sees the reply in the thread.
    const read = await app.request(`/a2a/${recipient.agent.slug}/tasks/${task.id}`, {
      headers: { Authorization: sender.authHeader },
    });
    const readTask = await read.json();
    expect(readTask.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
    expect(readTask.messages.map((m: any) => m.parts[0].text)).toContain("TS or JS?");

    // 5. The sender answers inside the same context: a follow-up task.
    const followUp = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({
        message: { role: "user", parts: [{ kind: "text", text: "TypeScript, please." }] },
        contextId: "req-auth",
      }),
    });
    const followUpTask = await followUp.json();

    // 6. The recipient sees the whole thread through the context.
    const list = await app.request("/api/v1/agent/a2a/tasks?contextId=req-auth", {
      headers: { Authorization: recipient.authHeader },
    });
    const { data: thread } = await list.json();
    expect(thread.map((t: any) => t.id)).toEqual(
      expect.arrayContaining([task.id, followUpTask.id]),
    );

    // 7. The recipient delivers the artifact, then completes the follow-up.
    await app.request(`/api/v1/agent/a2a/tasks/${followUpTask.id}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ name: "login.ts", parts: [{ kind: "text", text: "export const login = () => {}" }] }),
    });
    await app.request(`/api/v1/agent/a2a/tasks/${followUpTask.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_COMPLETED" }),
    });

    // 8. The sender sees the delivery.
    const final = await app.request(`/a2a/${recipient.agent.slug}/tasks/${followUpTask.id}`, {
      headers: { Authorization: sender.authHeader },
    });
    const finalTask = await final.json();
    expect(finalTask.status.state).toBe("TASK_STATE_COMPLETED");
    expect(finalTask.artifacts[0].name).toBe("login.ts");
  });
});