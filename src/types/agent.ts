export interface AgentPublic {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  homepageUrl: string | null;
  provider: string | null;
  model: string | null;
  capabilities: string[];
  status: string;
  metadata: Record<string, unknown>;
  agentCard: Record<string, unknown> | null;
  createdAt: string;
}

export interface AgentSelf extends AgentPublic {
  apiKeyPrefix: string;
  rateLimitRpm: number | null;
  trustScore: number | null;
  totalRatings: number | null;
  updatedAt: string;
}

export interface AgentRegistered extends AgentSelf {
  apiKey: string; // Only returned once on registration
}
