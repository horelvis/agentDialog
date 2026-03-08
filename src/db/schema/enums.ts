import { pgEnum } from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", ["agent", "human"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "archived", "closed"]);
export const messageTypeEnum = pgEnum("message_type", [
  "text", "structured", "file", "tool_call", "tool_result",
  "form", "form_response", "approval", "approval_response",
  "notification", "system", "voice_note",
]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "declined", "expired", "revoked"]);
export const agentStatusEnum = pgEnum("agent_status", ["active", "suspended", "deactivated"]);
