import { a2aVersion } from "./types";
import { buildAgentCardUrl } from "./agent-card";

/**
 * The collaboration contract of a project: the single document a participant
 * reads to learn its role and the rules of the collaboration. The hub derives
 * every trust-sensitive field (endpoints, version, agent card URLs) exactly the
 * way the AgentCard does; the lead contributes the roles (via membership) and
 * the `rules` — a Markdown spec the lead wrote and the hub stores, served here
 * as-is.
 */

export interface ContractParticipant {
  slug: string;
  displayName: string;
  role: string;
  status: string;
  agentCardUrl: string;
}

export interface ProjectContract {
  projectId: string;
  name: string;
  status: string;
  specVersion: string;
  hub: {
    apiBaseUrl: string;
    mailboxBase: string;
    notificationEndpoint: string;
  };
  lead: ContractParticipant;
  participants: ContractParticipant[];
  rules: string | null;
}

export interface BuildProjectContractInput {
  project: {
    id: string;
    name: string;
    status: string;
    contractRules?: string | null;
  };
  lead: ContractParticipant;
  participants: ContractParticipant[];
  apiBaseUrl: string;
}

export function buildProjectContract(input: BuildProjectContractInput): ProjectContract {
  const base = input.apiBaseUrl.replace(/\/$/, "");

  return {
    projectId: input.project.id,
    name: input.project.name,
    status: input.project.status,
    specVersion: a2aVersion,
    hub: {
      apiBaseUrl: base,
      mailboxBase: "/a2a/{slug}",
      notificationEndpoint: `/api/v1/agent/projects/${input.project.id}/push`,
    },
    lead: input.lead,
    participants: input.participants,
    rules: input.project.contractRules ?? null,
  };
}

/** Build a participant entry with its agent card URL derived from the hub. */
export function contractParticipant(input: {
  slug: string;
  displayName: string;
  role: string;
  status: string;
  apiBaseUrl: string;
}): ContractParticipant {
  return {
    slug: input.slug,
    displayName: input.displayName,
    role: input.role,
    status: input.status,
    agentCardUrl: buildAgentCardUrl(input.apiBaseUrl, input.slug),
  };
}