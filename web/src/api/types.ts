// Participant types
export type ActorType = "agent" | "human";
export type ConversationStatus = "active" | "archived" | "closed";
export type IntentType = "permission" | "clarification" | "solicitation" | "notification";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";
export type MessageType = "text" | "tool_call" | "tool_result" | "form" | "form_response" | "approval" | "approval_response" | "notification" | "file" | "system" | "voice_note" | "human_query" | "human_query_response";
export type QueryType = "validation" | "interpretation" | "expert_query" | "labeling";
export type QueryStatus = "pending" | "assigned" | "answered" | "needs_context" | "cancelled" | "expired";
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

export interface VoiceNoteData {
  durationMs: number;
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
  structuredData?: ToolCallData | ToolResultData | FormData | FormResponseData | ApprovalData | ApprovalResponseData | NotificationData | VoiceNoteData | null;
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

/** What the question is about — the referent the human can actually look at. */
export interface QuerySubject {
  id: string;
  label: string;
  uri?: string;
  body?: string;
  sha256?: string;
}

/** A before/after delta this query covers, for a question about a prior decision. */
export interface QueryChange {
  path: string;
  before: string;
  after: string;
  materiality: "minor" | "material";
}

/** One datum inside a `fields` answer space. Never nests. */
export type AnswerSlot = { id: string; label: string; proposed?: unknown } & (
  | { kind: "boolean"; labels: { t: string; f: string } }
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number }
  | { kind: "date"; earliest?: string; latest?: string }
  | { kind: "text"; maxLength: number }
);

/**
 * The closed catalogue of answer shapes a query can ask for. Mirrors the
 * server's catalogue (`src/lib/answer-space.ts`) structurally — declared
 * locally rather than imported because `web/` carries no dependency on
 * `@agentdialog/sdk` or on the API package, and this is the only place that
 * needs the shape.
 */
export type AnswerSpace =
  | { kind: "boolean"; labels: { t: string; f: string }; consequences?: { t: string; f: string } }
  | { kind: "choice"; select: "one" | "many";
      options: Array<{ id: string; label: string; consequence?: string }> }
  | { kind: "scalar"; unit: string; min?: number; max?: number; step?: number; effect?: string }
  | { kind: "date"; earliest?: string; latest?: string; effect?: string }
  | { kind: "text"; maxLength: number }
  | { kind: "fields"; fields: AnswerSlot[]; effect?: string };

/** The human's typed answer. Its `kind` must match the query's `answerSpace`. */
export type Answer =
  | { kind: "boolean"; value: boolean }
  | { kind: "choice"; optionIds: string[] }
  | { kind: "scalar"; value: number }
  | { kind: "date"; value: string }
  | { kind: "text"; value: string }
  | { kind: "fields"; values: Record<string, unknown> };

export const INSUFFICIENT_REASONS = [
  "unknown_subject",
  "missing_delta",
  "unclear_consequences",
  "referent_unreachable",
  "not_my_decision",
] as const;

export type InsufficientReason = (typeof INSUFFICIENT_REASONS)[number];

export interface HumanQuery {
  id: string;
  conversationId: string;
  queryType: QueryType;
  status: QueryStatus;
  statusDescription: string;
  question: string;
  context: string | null;
  confidence: number | null;
  subject: QuerySubject;
  selfContained: boolean;
  changes: QueryChange[] | null;
  risk: RiskLevel;
  answerSpace: AnswerSpace;
  insufficientReason: InsufficientReason | null;
  answer: Answer | null;
  answerComment: string | null;
  answerConfidence: number | null;
  responseTimeMs: number | null;
  /** ISO timestamp of a prior answered query about the same subject, if the API found one. */
  priorDecisionAt: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SendMessageInput {
  type: MessageType;
  content?: string;
  structuredData?: Record<string, unknown>;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}
