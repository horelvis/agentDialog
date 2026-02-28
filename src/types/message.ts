export interface MessagePublic {
  id: string;
  conversationId: string;
  senderType: string;
  senderAgentId: string | null;
  senderHumanId: string | null;
  type: string;
  content: string | null;
  structuredData: Record<string, unknown> | null;
  replyToId: string | null;
  toolCallId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
