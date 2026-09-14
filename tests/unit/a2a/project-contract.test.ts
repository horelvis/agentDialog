import { describe, expect, it } from "bun:test";
import {
  buildProjectContract,
  contractParticipant,
  type ContractParticipant,
} from "../../../src/lib/a2a/project-contract";

const lead: ContractParticipant = {
  slug: "lead-agent",
  displayName: "Lead Agent",
  role: "lead",
  status: "active",
  agentCardUrl: "https://api.agentdialog.io/a2a/lead-agent",
};

const member: ContractParticipant = {
  slug: "worker",
  displayName: "Worker",
  role: "member",
  status: "active",
  agentCardUrl: "https://api.agentdialog.io/a2a/worker",
};

describe("buildProjectContract", () => {
  it("derives the hub fields from the API base URL", () => {
    const contract = buildProjectContract({
      project: { id: "p1", name: "Ship login", status: "active" },
      lead,
      participants: [member],
      apiBaseUrl: "https://api.agentdialog.io",
    });

    expect(contract.hub.apiBaseUrl).toBe("https://api.agentdialog.io");
    expect(contract.hub.mailboxBase).toBe("/a2a/{slug}");
    expect(contract.hub.notificationEndpoint).toBe("/api/v1/agent/projects/p1/push");
  });

  it("carries the lead, the participants and the spec version", () => {
    const contract = buildProjectContract({
      project: { id: "p1", name: "Ship login", status: "active" },
      lead,
      participants: [member],
      apiBaseUrl: "https://api.agentdialog.io",
    });

    expect(contract.projectId).toBe("p1");
    expect(contract.specVersion).toBe("1.0");
    expect(contract.lead.slug).toBe("lead-agent");
    expect(contract.participants).toHaveLength(1);
    expect(contract.participants[0].slug).toBe("worker");
  });

  it("serves the lead's Markdown rules as-is, or null when unset", () => {
    const withRules = buildProjectContract({
      project: { id: "p1", name: "Ship login", status: "active", contractRules: "# Rules\n\n- never deploy on Fridays" },
      lead,
      participants: [],
      apiBaseUrl: "https://api.agentdialog.io",
    });
    expect(withRules.rules).toBe("# Rules\n\n- never deploy on Fridays");

    const withoutRules = buildProjectContract({
      project: { id: "p1", name: "Ship login", status: "active" },
      lead,
      participants: [],
      apiBaseUrl: "https://api.agentdialog.io",
    });
    expect(withoutRules.rules).toBeNull();
  });
});

describe("contractParticipant", () => {
  it("derives the agent card URL from the hub, stripping a trailing slash", () => {
    const p = contractParticipant({
      slug: "worker",
      displayName: "Worker",
      role: "member",
      status: "active",
      apiBaseUrl: "https://api.agentdialog.io/",
    });
    expect(p.agentCardUrl).toBe("https://api.agentdialog.io/a2a/worker");
  });
});