import { pgEnum } from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", ["agent", "human"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "archived", "closed"]);
export const messageTypeEnum = pgEnum("message_type", [
  "text", "structured", "file", "tool_call", "tool_result",
  "form", "form_response", "approval", "approval_response",
  "notification", "system", "voice_note",
  "human_query", "human_query_response",
]);
export const queryTypeEnum = pgEnum("query_type", ["validation", "interpretation", "expert_query", "labeling"]);
export const queryStatusEnum = pgEnum("query_status", [
  "pending", "assigned", "needs_context", "answered", "expired", "cancelled",
]);
export const queryRiskEnum = pgEnum("query_risk", ["low", "medium", "high", "critical"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "declined", "expired", "revoked"]);
export const agentStatusEnum = pgEnum("agent_status", ["active", "suspended", "deactivated"]);
