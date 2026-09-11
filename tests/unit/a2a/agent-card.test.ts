import { describe, expect, it } from "bun:test";
import {
  buildAgentCard,
  buildAgentCardUrl,
  assertNoProtectedOverrides,
  type AgentLike,
} from "@/lib/a2a/agent-card";

const baseAgent: AgentLike = {
  slug: "invoice-checker",
  displayName: "Invoice Checker",
  description: "Validates incoming invoices against contracts.",
};

describe("buildAgentCard", () => {
  it("derives name from displayName and exposes both bindings", () => {
    const card = buildAgentCard(baseAgent, "https://api.agentdialog.io/a2a/invoice-checker");
    expect(card.name).toBe("Invoice Checker");
    expect(card.version).toBe("1.0");
    expect(card.supportedInterfaces).toHaveLength(2);
    expect(card.supportedInterfaces.map((i) => i.protocolBinding)).toContain("HTTP+JSON");
    expect(card.supportedInterfaces.map((i) => i.protocolBinding)).toContain("JSONRPC");
    expect(card.capabilities?.streaming).toBe(true);
    expect(card.capabilities?.pushNotifications).toBe(true);
    expect(card.capabilities?.extendedAgentCard).toBe(false);
  });

  it("includes the default mailbox skill when no skills are declared", () => {
    const card = buildAgentCard(baseAgent, "https://api.agentdialog.io/a2a/invoice-checker");
    expect(card.skills).toHaveLength(1);
    expect(card.skills?.[0].id).toBe("agentdialog-mailbox");
  });

  it("merges agent-declared skills and keeps the default skill", () => {
    const agent: AgentLike = {
      ...baseAgent,
      agentCard: {
        skills: [
          {
            id: "validate-invoice",
            name: "Validate Invoice",
            description: "Checks an invoice against a contract.",
          },
        ],
      },
    };
    const card = buildAgentCard(agent, "https://api.agentdialog.io/a2a/invoice-checker");
    expect(card.skills?.map((s) => s.id)).toContain("validate-invoice");
    expect(card.skills?.map((s) => s.id)).toContain("agentdialog-mailbox");
  });

  it("rejects overrides of protected fields", () => {
    const agent: AgentLike = {
      ...baseAgent,
      agentCard: {
        capabilities: { streaming: false },
      },
    };
    expect(() =>
      buildAgentCard(agent, "https://api.agentdialog.io/a2a/invoice-checker"),
    ).toThrow(/capabilities.*cannot be overridden/);
  });

  it("rejects overrides of supported interfaces", () => {
    const agent: AgentLike = {
      ...baseAgent,
      agentCard: {
        supportedInterfaces: [],
      },
    };
    expect(() =>
      buildAgentCard(agent, "https://api.agentdialog.io/a2a/invoice-checker"),
    ).toThrow(/supportedInterfaces.*cannot be overridden/);
  });

  it("allows optional provider and iconUrl decorations", () => {
    const agent: AgentLike = {
      ...baseAgent,
      agentCard: {
        provider: { organization: "Acme" },
        iconUrl: "https://example.com/icon.png",
      },
    };
    const card = buildAgentCard(agent, "https://api.agentdialog.io/a2a/invoice-checker");
    expect(card.provider?.organization).toBe("Acme");
    expect(card.iconUrl).toBe("https://example.com/icon.png");
  });
});

describe("buildAgentCardUrl", () => {
  it("joins the public API URL with the agent slug", () => {
    expect(buildAgentCardUrl("https://api.agentdialog.io/", "invoice-checker")).toBe(
      "https://api.agentdialog.io/a2a/invoice-checker",
    );
    expect(buildAgentCardUrl("https://api.agentdialog.io", "invoice-checker")).toBe(
      "https://api.agentdialog.io/a2a/invoice-checker",
    );
  });
});

describe("assertNoProtectedOverrides", () => {
  it("does not throw for safe fields", () => {
    expect(() => assertNoProtectedOverrides({ skills: [], iconUrl: "x" })).not.toThrow();
  });

  it("throws for version", () => {
    expect(() => assertNoProtectedOverrides({ version: "2.0" })).toThrow();
  });
});
