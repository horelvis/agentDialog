import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

const app = createTestApp();

describe("A2A JSON-RPC binding", () => {
  it("dispatches message/send and tasks/get", async () => {
    const sender = await createTestAgent();
    const recipient = await createTestAgent();

    const send = await app.request(`/a2a/${recipient.agent.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: { message: { role: "user", parts: [{ kind: "text", text: "via RPC" }] } },
        id: 1,
      }),
    });
    expect(send.status).toBe(200);
    const sendBody = await send.json();
    expect(sendBody.id).toBe(1);
    expect(sendBody.result.status.state).toBe("TASK_STATE_SUBMITTED");

    const taskId = sendBody.result.id;
    const get = await app.request(`/a2a/${recipient.agent.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ jsonrpc: "2.0", method: "tasks/get", params: { taskId }, id: 2 }),
    });
    const getBody = await get.json();
    expect(getBody.result.id).toBe(taskId);
  });

  it("answers an unknown method with -32601", async () => {
    const sender = await createTestAgent();
    const recipient = await createTestAgent();

    const res = await app.request(`/a2a/${recipient.agent.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sender.authHeader },
      body: JSON.stringify({ jsonrpc: "2.0", method: "no/such", id: 3 }),
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});