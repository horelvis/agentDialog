import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";
import { conversationResponse } from "../../src/validators/conversation.responses";

describe("Conversation Flow", () => {
  const app = createTestApp();

  it("full agent → human conversation flow", async () => {
    // 1. Register agent
    const regRes = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `flow-agent-${Date.now()}`,
        displayName: "Flow Test Agent",
      }),
    });
    expect(regRes.status).toBe(201);
    const { data: agentData } = await regRes.json();
    const agentAuth = `Bearer ${agentData.apiKey}`;

    // 2. Get agent profile
    const meRes = await app.request("/api/v1/agent/me", {
      headers: { Authorization: agentAuth },
    });
    expect(meRes.status).toBe(200);

    // 3. Create conversation
    const convRes = await app.request("/api/v1/agent/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: agentAuth,
      },
      body: JSON.stringify({
        title: "Test Conversation",
        description: "Testing the full flow",
        intentType: "clarification",
      }),
    });
    expect(convRes.status).toBe(201);
    const convResBody = await convRes.clone().json();
    expect(() => conversationResponse.parse(convResBody)).not.toThrow();
    const { data: conversation } = await convRes.json();
    expect(conversation.title).toBe("Test Conversation");

    // 4. Send a message as agent
    const msgRes = await app.request(`/api/v1/agent/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: agentAuth,
      },
      body: JSON.stringify({
        type: "text",
        content: "Hello! I need your help with something.",
      }),
    });
    expect(msgRes.status).toBe(201);

    // 5. Send a tool_call message
    const toolRes = await app.request(`/api/v1/agent/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: agentAuth,
      },
      body: JSON.stringify({
        type: "tool_call",
        content: "Searching the web...",
        structuredData: {
          toolName: "web_search",
          toolInput: { query: "latest news" },
          status: "running",
        },
      }),
    });
    expect(toolRes.status).toBe(201);

    // 6. List messages
    const listRes = await app.request(`/api/v1/agent/conversations/${conversation.id}/messages`, {
      headers: { Authorization: agentAuth },
    });
    expect(listRes.status).toBe(200);
    const { data: messageList } = await listRes.json();
    expect(messageList.length).toBe(2);

    // 7. Create invitation
    const invRes = await app.request(`/api/v1/agent/conversations/${conversation.id}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: agentAuth,
      },
      body: JSON.stringify({
        email: "human@example.com",
        message: "Join the conversation!",
      }),
    });
    expect(invRes.status).toBe(201);

    // 8. Send an approval request
    const approvalRes = await app.request(`/api/v1/agent/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: agentAuth,
      },
      body: JSON.stringify({
        type: "approval",
        content: "Should I deploy to production?",
        structuredData: {
          approvalId: "deploy-001",
          action: "deploy-production",
          riskLevel: "high",
          details: "Deploy v2.0 to production cluster",
        },
      }),
    });
    expect(approvalRes.status).toBe(201);
  });
});
