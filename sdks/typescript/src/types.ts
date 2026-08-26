import type { Language } from "./queries.js";

// ── Enums ──

export type ActorType = "agent" | "human";
export type ConversationStatus = "active" | "archived" | "closed";
export type IntentType = "permission" | "clarification" | "solicitation" | "notification";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";
export type MessageType =
  | "text"
  | "structured"
  | "file"
  | "tool_call"
  | "tool_result"
  | "form"
  | "form_response"
  | "approval"
  | "approval_response"
  | "notification"
  | "system";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Severity = "info" | "warning" | "error" | "success";
export type ToolCallStatus = "pending" | "running" | "completed" | "failed";

// ── Agent ──

export interface Agent {
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
  apiKeyPrefix?: string;
  rateLimitRpm?: number;
  metadata: Record<string, unknown> | null;
  agentCard?: Record<string, unknown> | null;
  trustScore?: number;
  totalRatings?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface RegisteredAgent extends Agent {
  apiKey: string;
}

// ── Participant ──

export interface Participant {
  actorType: ActorType;
  agentId?: string;
  humanId?: string;
  displayName: string;
  role: "owner" | "participant";
  joinedAt: string;
  lastReadAt?: string;
}

// ── Conversation ──

export interface Conversation {
  id: string;
  title: string | null;
  description: string | null;
  status: ConversationStatus;
  intentType: IntentType | null;
  createdByAgentId: string;
  context: Record<string, unknown> | null;
  participants?: Participant[];
  lastMessage?: Message;
  settings?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ── Message ──

export interface Message {
  id: string;
  conversationId: string;
  senderType: ActorType;
  senderAgentId?: string;
  senderHumanId?: string;
  type: MessageType;
  content: string | null;
  structuredData?: Record<string, unknown> | null;
  replyToId?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  attachments?: FileAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface FileAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
}

// ── Invitation ──

export interface Invitation {
  id: string;
  conversationId: string;
  token: string;
  invitedByAgentId: string;
  invitedHumanEmail: string;
  status: InvitationStatus;
  message?: string;
  agentDisplayName?: string;
  conversationTitle?: string;
  expiresAt: string;
  createdAt: string;
}

// ── Webhook ──

export interface Webhook {
  id: string;
  agentId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookWithSecret extends Webhook {
  secret: string;
}

// ── API responses ──

export interface Pagination {
  hasMore: boolean;
  nextCursor?: string | null;
  count: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// ── Input types ──

export interface RegisterInput {
  slug: string;
  displayName: string;
  description?: string;
  avatarUrl?: string;
  homepageUrl?: string;
  provider?: string;
  model?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
  agentCard?: Record<string, unknown>;
}

export interface UpdateProfileInput {
  displayName?: string;
  description?: string;
  avatarUrl?: string | null;
  homepageUrl?: string | null;
  provider?: string;
  model?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
  agentCard?: Record<string, unknown>;
}

export interface CreateConversationInput {
  title?: string;
  description?: string;
  context?: Record<string, unknown>;
  intentType?: IntentType;
  settings?: Record<string, unknown>;
}

export interface UpdateConversationInput {
  title?: string;
  description?: string;
  status?: ConversationStatus;
  context?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface SendMessageInput {
  type?: MessageType;
  content?: string;
  structuredData?: Record<string, unknown>;
  replyToId?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
}

export interface InviteHumanInput {
  email: string;
  message?: string;
  /**
   * The language the invitation email's wrapper is written in — subject
   * line, labels, dates. Absent means `en`. It does NOT translate `message`:
   * that travels exactly as written, so write it in the language you
   * declare here.
   */
  language?: Language;
  expiresInHours?: number;
}

export interface CreateWebhookInput {
  url: string;
  events?: string[];
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  isActive?: boolean;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

// ── Client options ──

export interface AgentDialogOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface RotateKeyResponse {
  apiKey: string;
  apiKeyPrefix: string;
  message: string;
}
