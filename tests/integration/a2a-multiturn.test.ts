import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * Collaboration must survive the isolation guarantees: the sender and the
 * recipient are different, protected actors, and still have to work the same
 * task. This proves the multi-turn loop end to end — including that a new task
 * reaches the assignee's project webhook, and that a reply from the recipient
 * reaches the sender's project webhook. Both register once, at the project
 * level, instead of per task.
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
    const lead = await createTestAgent();
    const recipient = await createTestAgent();
    received = [];

    // 1. Lead creates a project and invites the recipient.
    const created = await app.request("/api/v1/agent/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ name: "Auth service" }),
    });
    expect(created.status).toBe(201);
    const { data: project } = await created.json();

    const invited = await app.request(`/api/v1/agent/projects/${project.project_id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ agent_id: recipient.agent.id, role: "member" }),
    });
    expect(invited.status).toBe(201);

    // 2. The lead writes the collaboration rules, and both register their
    //    project webhook — each one once, for the whole project.
    const rules = await app.request(`/api/v1/agent/projects/${project.project_id}/contract-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ markdown: "# Rules\n\n- deliver artifacts as text" }),
    });
    expect(rules.status).toBe(200);

    const recipientHook = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ url: hookUrl, authInfo: { type: "bearer", token: "hook-secret" } }),
    });
    expect(recipientHook.status).toBe(200);

    const leadHook = await app.request(`/api/v1/agent/projects/${project.project_id}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ url: hookUrl, authInfo: { type: "bearer", token: "hook-secret" } }),
    });
    expect(leadHook.status).toBe(200);

    // 3. The lead assigns a subtask through the project; the assignee's
    //    webhook learns about it without polling.
    const assigned = await app.request(`/api/v1/agent/projects/${project.project_id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({
        assignee_agent_id: recipient.agent.id,
        title: "Implement /login",
        message: "Implement the login endpoint",
      }),
    });
    expect(assigned.status).toBe(201);
    const { data: projectAfter } = await assigned.json();
    const taskId = projectAfter.tasks[0].a2a_task_id;

    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((e) => e.event === "task_new")).toBe(true);

    // 4. The recipient starts, replies with a message, and asks for input.
    await app.request(`/api/v1/agent/a2a/tasks/${taskId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_WORKING" }),
    });

    await app.request(`/api/v1/agent/a2a/tasks/${taskId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ role: "agent", parts: [{ kind: "text", text: "TS or JS?" }] }),
    });

    await app.request(`/api/v1/agent/a2a/tasks/${taskId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: recipient.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_INPUT_REQUIRED" }),
    });

    // 5. The reply reached the lead's webhook (both hooks point at the same
    //    URL, so the message events are there).
    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((e) => e.event === "task_message")).toBe(true);
    expect(received.some((e) => e.event === "task_status")).toBe(true);

    // 6. The lead reads the task and sees the reply in the thread.
    const read = await app.request(`/a2a/${recipient.agent.slug}/tasks/${taskId}`, {
      headers: { Authorization: lead.authHeader },
    });
    const readTask = await read.json();
    expect(readTask.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
    expect(readTask.messages.map((m: any) => m.parts[0].text)).toContain("TS or JS?");

    // 7. The lead answers inside the same context: a follow-up task.
    const followUp = await app.request(`/a2a/${recipient.agent.slug}/message:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({
        message: { role: "user", parts: [{ kind: "text", text: "TypeScript, please." }] },
        contextId: "req-auth",
        metadata: { projectId: project.project_id },
      }),
    });
    const followUpTask = await followUp.json();

    // 8. The recipient sees the follow-up in its context thread. (The original
    //    project task carries no contextId, so it lives outside this thread.)
    const list = await app.request("/api/v1/agent/a2a/tasks?contextId=req-auth", {
      headers: { Authorization: recipient.authHeader },
    });
    const { data: thread } = await list.json();
    expect(thread.map((t: any) => t.id)).toEqual(
      expect.arrayContaining([followUpTask.id]),
    );

    // 9. The recipient delivers the artifact, then completes the follow-up.
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

    // 10. The artifact reached the lead's webhook too.
    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((e) => e.event === "task_artifact")).toBe(true);
  }, 15000);
});