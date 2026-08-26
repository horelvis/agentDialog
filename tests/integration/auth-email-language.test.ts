import { describe, expect, it, beforeAll, mock } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

const captured: Array<{ subject: string; html: string }> = [];

mock.module("../../src/lib/email", () => ({
  sendEmail: async (options: { subject: string; html: string }) => {
    captured.push(options);
    return true;
  },
  buildVerificationCodeEmail: (code: string) => ({ to: "", subject: "", html: code, text: code }),
}));

describe("Sign-in code language", () => {
  const app = createTestApp();
  let invitedEmail: string;

  beforeAll(async () => {
    // Create an agent and a query to generate an invitation
    const { authHeader } = await createTestAgent();
    invitedEmail = `invited-${Date.now()}@example.com`;

    // Create a query which will create the invitation
    await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation",
        subject: { id: `subj-${Date.now()}`, label: "Test", body: "Test body" },
        question: "Test question?",
        answer_space: { kind: "text", max_length: 500 },
        target_human_email: invitedEmail,
        timeout_minutes: 60,
      }),
    });
  });

  it("uses the browser's language, because there is a browser in front", async () => {
    // The person asking for a code has just typed their address into a screen.
    // Their Accept-Language is a better source than anything we could infer.
    captured.length = 0;

    await app.request("/api/v1/human/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "ca-ES,ca;q=0.9" },
      body: JSON.stringify({ email: invitedEmail }),
    });

    expect(captured.length).toBe(1);
    expect(captured[0]!.subject).toBe("AgentDialog - El teu codi d'accés");
  });

  it("falls back to English with no header", async () => {
    captured.length = 0;

    await app.request("/api/v1/human/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invitedEmail }),
    });

    expect(captured.length).toBe(1);
    expect(captured[0]!.subject).toBe("AgentDialog - Your verification code");
  });
});

describe("Email HTML escaping", () => {
  const app = createTestApp();

  it("escapes HTML in invitation agent name and conversation title", async () => {
    const { authHeader } = await createTestAgent({
      displayName: "Agent <script>alert('xss')</script>",
    });
    const evilEmail = `evil-${Date.now()}@example.com`;

    // Create a conversation with HTML in the title
    const conversationRes = await app.request("/api/v1/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        title: "Conversation <img src=x onerror=alert('xss')>",
        description: "Testing",
      }),
    });
    expect(conversationRes.status).toBe(201);
    const { data: { id } } = await conversationRes.json();

    captured.length = 0;
    const inviteRes = await app.request(`/api/v1/agent/conversations/${id}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        email: evilEmail,
        language: "en",
      }),
    });
    expect(inviteRes.status).toBe(201);

    expect(captured.length).toBe(1);
    const html = captured[0]!.html;
    // Should contain escaped versions of both agent name and title
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    // Should NOT contain raw HTML tags
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
  });
});
