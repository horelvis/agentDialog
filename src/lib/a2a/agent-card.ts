import {
  agentCardSchema,
  a2aVersion,
  type AgentCard,
  type AgentInterface,
  type AgentSkill,
} from "./types";

/**
 * The AgentCard is the only public discovery document an A2A client needs. We
 * derive the trust-sensitive fields (endpoints, capabilities, security) from
 * the AgentDialog platform. The agent can only decorate its card with skills,
 * descriptions and icons declared in metadata.agentCard.
 */

export interface AgentLike {
  slug: string;
  displayName: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  agentCard?: Record<string, unknown> | null;
}

const DEFAULT_SKILL: AgentSkill = {
  id: "agentdialog-mailbox",
  name: "AgentDialog A2A mailbox",
  description: "Receive tasks and return artifacts through the AgentDialog A2A mailbox.",
  tags: ["a2a", "mailbox"],
};

const PROTECTED_CARD_FIELDS = new Set([
  "name",
  "version",
  "supportedInterfaces",
  "capabilities",
  "securitySchemes",
  "securityRequirements",
  "defaultInputModes",
  "defaultOutputModes",
]);

export function buildAgentCard(
  agent: AgentLike,
  baseUrl: string,
  options?: { protocolVersion?: string },
): AgentCard {
  const protocolVersion = options?.protocolVersion ?? a2aVersion;

  const supportedInterfaces: AgentInterface[] = [
    {
      protocolBinding: "HTTP+JSON",
      url: baseUrl,
      protocolVersion,
    },
    {
      protocolBinding: "JSONRPC",
      url: baseUrl,
      protocolVersion,
    },
  ];

  const userCard = (agent.agentCard ?? {}) as Partial<AgentCard>;
  assertNoProtectedOverrides(userCard);

  const userSkills = Array.isArray(userCard.skills)
    ? userCard.skills.map((s) => s as AgentSkill)
    : [];

  const skills = userSkills.length > 0
    ? [...userSkills, DEFAULT_SKILL]
    : [DEFAULT_SKILL];

  const card: AgentCard = {
    name: agent.displayName,
    version: protocolVersion,
    description: agent.description ?? undefined,
    supportedInterfaces,
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true,
      extendedAgentCard: false,
    },
    securitySchemes: {
      agentdialog_api_key: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description: "Bearer API key issued by AgentDialog for the agent account.",
      },
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills,
  };

  if (userCard.provider) card.provider = userCard.provider;
  if (userCard.iconUrl) card.iconUrl = userCard.iconUrl;

  return agentCardSchema.parse(card);
}

export function assertNoProtectedOverrides(userCard: Record<string, unknown>): void {
  for (const field of Object.keys(userCard)) {
    if (PROTECTED_CARD_FIELDS.has(field)) {
      throw new Error(
        `AgentCard field '${field}' is managed by AgentDialog and cannot be overridden via metadata.agentCard`,
      );
    }
  }
}

export function buildAgentCardUrl(publicApiUrl: string, agentSlug: string): string {
  const base = publicApiUrl.replace(/\/$/, "");
  return `${base}/a2a/${agentSlug}`;
}
