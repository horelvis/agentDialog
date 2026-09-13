import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

/**
 * Distributed project flow: a lead creates a project, invites a participant,
 * assigns a subtask, and the participant delivers it through the A2A mailbox.
 * The security boundary is tested directly: a participant never sees another
 * participant's tasks, and a non-lead cannot touch the project.
 */

const app = createTestApp();

async function createProject(lead: { authHeader: string }) {
  const res = await app.request("/api/v1/agent/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
    body: JSON.stringify({ name: "Backend + frontend", description: "Implement /login on both ends" }),
  });
  expect(res.status).toBe(201);
  const { data } = await res.json();
  return data;
}

describe("agent projects", () => {
  it("runs the full collaboration flow", async () => {
    const lead = await createTestAgent();
    const frontend = await createTestAgent();
    const backend = await createTestAgent();

    const project = await createProject(lead);

    // Lead invites both participants.
    for (const agent of [frontend, backend]) {
      const invite = await app.request(`/api/v1/agent/projects/${project.project_id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
        body: JSON.stringify({ agent_id: agent.agent.id }),
      });
      expect(invite.status).toBe(201);
    }

    // Assign a subtask to the backend agent.
    const assign = await app.request(`/api/v1/agent/projects/${project.project_id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({
        assignee_agent_id: backend.agent.id,
        title: "Implement /login",
        description: "Return a session token",
        message: "Implement the login endpoint and return the session token.",
      }),
    });
    expect(assign.status).toBe(201);
    const { data: projectTask } = await assign.json();

    // The assignee sees the task in its A2A mailbox.
    const mailbox = await app.request("/api/v1/agent/a2a/tasks", {
      headers: { Authorization: backend.authHeader },
    });
    const { data: mailboxTasks } = await mailbox.json();
    expect(mailboxTasks.map((t: any) => t.id)).toContain(projectTask.tasks[0].a2a_task_id);

    // The assignee reports progress and delivers an artifact.
    await app.request(`/api/v1/agent/a2a/tasks/${projectTask.tasks[0].a2a_task_id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: backend.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_WORKING" }),
    });
    const deliver = await app.request(`/api/v1/agent/a2a/tasks/${projectTask.tasks[0].a2a_task_id}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: backend.authHeader },
      body: JSON.stringify({ name: "login.ts", parts: [{ kind: "text", text: "export async function login() {}" }] }),
    });
    expect(deliver.status).toBe(201);
    await app.request(`/api/v1/agent/a2a/tasks/${projectTask.tasks[0].a2a_task_id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: backend.authHeader },
      body: JSON.stringify({ state: "TASK_STATE_COMPLETED" }),
    });

    // The lead sees the completed project with the delivery inside.
    const view = await app.request(`/api/v1/agent/projects/${project.project_id}`, {
      headers: { Authorization: lead.authHeader },
    });
    expect(view.status).toBe(200);
    const { data: fetched } = await view.json();
    expect(fetched.status).toBe("completed");
    expect(fetched.tasks).toHaveLength(1);
    // The subtask's status is read live from its A2A task, so a completed
    // delivery must not show the stored "assigned".
    expect(fetched.tasks[0].status).toBe("completed");
    expect(fetched.participants.map((p: any) => p.agent_id)).toEqual(
      expect.arrayContaining([lead.agent.id, frontend.agent.id, backend.agent.id]),
    );
  });

  it("does not let a participant see another participant's tasks", async () => {
    const lead = await createTestAgent();
    const alice = await createTestAgent();
    const bob = await createTestAgent();

    const project = await createProject(lead);

    for (const agent of [alice, bob]) {
      await app.request(`/api/v1/agent/projects/${project.project_id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
        body: JSON.stringify({ agent_id: agent.agent.id }),
      });
    }

    await app.request(`/api/v1/agent/projects/${project.project_id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({
        assignee_agent_id: alice.agent.id,
        title: "Alice only",
        message: "Do the thing.",
      }),
    });

    // Alice's participant view carries only her task.
    const aliceView = await app.request(`/api/v1/agent/projects/${project.project_id}`, {
      headers: { Authorization: alice.authHeader },
    });
    expect(aliceView.status).toBe(200);
    const aliceData = await aliceView.json();
    expect(aliceData.data.tasks.map((t: any) => t.title)).toEqual(["Alice only"]);

    // Bob reads the project as a participant: he sees the project, but not
    // Alice's task — only tasks assigned to him.
    const bobView = await app.request(`/api/v1/agent/projects/${project.project_id}`, {
      headers: { Authorization: bob.authHeader },
    });
    expect(bobView.status).toBe(200);
    const bobData = await bobView.json();
    expect(bobData.data.tasks.map((t: any) => t.title)).not.toContain("Alice only");
    expect(bobData.data.tasks).toHaveLength(0);
  });

  it("only the lead can cancel a project", async () => {
    const lead = await createTestAgent();
    const member = await createTestAgent();
    const project = await createProject(lead);

    await app.request(`/api/v1/agent/projects/${project.project_id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: lead.authHeader },
      body: JSON.stringify({ agent_id: member.agent.id }),
    });

    const asMember = await app.request(`/api/v1/agent/projects/${project.project_id}/cancel`, {
      method: "POST",
      headers: { Authorization: member.authHeader },
    });
    expect(asMember.status).toBe(403);

    const asLead = await app.request(`/api/v1/agent/projects/${project.project_id}/cancel`, {
      method: "POST",
      headers: { Authorization: lead.authHeader },
    });
    expect(asLead.status).toBe(200);
    const { data } = await asLead.json();
    expect(data.status).toBe("canceled");
  });
});