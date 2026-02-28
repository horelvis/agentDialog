// Participant types
export type ActorType = "agent" | "human";
export type ConversationStatus = "active" | "archived" | "closed";
export type IntentType = "permission" | "clarification" | "solicitation" | "notification";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";
export type MessageType = "text" | "tool_call" | "tool_result" | "form" | "form_response" | "approval" | "approval_response" | "notification" | "file" | "system";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Severity = "info" | "warning" | "error" | "success";
export type ToolCallStatus = "running" | "completed" | "failed";

export interface Human {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Agent {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  provider: string | null;
  model: string | null;
  capabilities: string[];
  status: string;
}

export interface Participant {
  actorType: ActorType;
  agentId?: string;
  humanId?: string;
  displayName: string;
  role: "owner" | "participant";
  joinedAt: string;
  lastReadAt?: string;
}

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
  createdAt: string;
  updatedAt: string;
}

export interface FormField {
  name: string;
  type: "text" | "number" | "select" | "textarea" | "checkbox" | "date" | "email" | "url";
  label: string;
  required?: boolean;
  options?: string[];
  defaultValue?: unknown;
  placeholder?: string;
}

export interface ToolCallData {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolServer?: string;
  status: ToolCallStatus;
}

export interface ToolResultData {
  toolCallId: string;
  output: unknown;
  durationMs: number;
}

export interface FormData {
  formId: string;
  title: string;
  fields: FormField[];
  expiresAt?: string;
}

export interface FormResponseData {
  formId: string;
  responses: Record<string, unknown>;
}

export interface ApprovalData {
  approvalId: string;
  action: string;
  riskLevel: RiskLevel;
  details?: string;
  expiresAt?: string;
}

export interface ApprovalResponseData {
  approvalId: string;
  decision: "approved" | "denied";
  reason?: string;
}

export interface NotificationData {
  severity: Severity;
  title: string;
  details?: string;
  acknowledgeRequired?: boolean;
}

export interface FileAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: ActorType;
  senderAgentId?: string;
  senderHumanId?: string;
  type: MessageType;
  content: string | null;
  structuredData?: ToolCallData | ToolResultData | FormData | FormResponseData | ApprovalData | ApprovalResponseData | NotificationData | null;
  replyToId?: string;
  metadata?: Record<string, unknown>;
  attachments?: FileAttachment[];
  createdAt: string;
  updatedAt: string;
}

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

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total?: number;
    limit: number;
    cursor?: string;
    hasMore: boolean;
  };
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
  };
}

export interface SendMessageInput {
  type: MessageType;
  content?: string;
  structuredData?: Record<string, unknown>;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}
