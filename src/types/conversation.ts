export interface ConversationPublic {
  id: string;
  createdByAgentId: string;
  title: string | null;
  description: string | null;
  status: string;
  intentType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationPublic {
  context: Record<string, unknown>;
  settings: Record<string, unknown>;
  participants: ParticipantInfo[];
}

export interface ParticipantInfo {
  actorType: string;
  agentId: string | null;
  humanId: string | null;
  displayName: string;
  role: string;
  joinedAt: string;
}
