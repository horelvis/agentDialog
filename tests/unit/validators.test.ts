import { describe, expect, it } from "bun:test";
import { agentRegisterSchema } from "../../src/validators/agent.validators";
import { createMessageSchema } from "../../src/validators/message.validators";
import { createInvitationSchema } from "../../src/validators/invitation.validators";

describe("agent validators", () => {
  it("validates a correct registration", () => {
    const result = agentRegisterSchema.safeParse({
      slug: "my-agent",
      displayName: "My Agent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid slugs", () => {
    const result = agentRegisterSchema.safeParse({
      slug: "UPPERCASE",
      displayName: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slugs with special characters", () => {
    const result = agentRegisterSchema.safeParse({
      slug: "my_agent",
      displayName: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short slugs", () => {
    const result = agentRegisterSchema.safeParse({
      slug: "ab",
      displayName: "Test",
    });
    expect(result.success).toBe(false);
  });
});

describe("message validators", () => {
  it("validates a text message", () => {
    const result = createMessageSchema.safeParse({
      content: "Hello world",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("text");
    }
  });

  it("validates an approval message", () => {
    const result = createMessageSchema.safeParse({
      type: "approval",
      content: "Deploy to production?",
      structuredData: {
        approvalId: "deploy-123",
        action: "deploy",
        riskLevel: "high",
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates a form message", () => {
    const result = createMessageSchema.safeParse({
      type: "form",
      content: "Please fill out this form",
      structuredData: {
        formId: "feedback-form",
        title: "Feedback",
        fields: [
          { name: "rating", type: "number", required: true },
          { name: "comment", type: "textarea" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("invitation validators", () => {
  it("validates a correct invitation", () => {
    const result = createInvitationSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresInHours).toBe(48);
    }
  });

  it("rejects invalid email", () => {
    const result = createInvitationSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
