import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { agents } from "./agents";
import { humans } from "./humans";
import { actorTypeEnum, messageTypeEnum } from "./enums";

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderType: actorTypeEnum("sender_type").notNull(),
  senderAgentId: uuid("sender_agent_id").references(() => agents.id),
  senderHumanId: uuid("sender_human_id").references(() => humans.id),
  type: messageTypeEnum("type").notNull().default("text"),
  content: text("content"),
  structuredData: jsonb("structured_data").$type<Record<string, unknown>>(),
  replyToId: uuid("reply_to_id"),
  toolCallId: uuid("tool_call_id"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("messages_conversation_idx").on(table.conversationId),
  index("messages_sender_agent_idx").on(table.senderAgentId),
  index("messages_sender_human_idx").on(table.senderHumanId),
  index("messages_type_idx").on(table.type),
  index("messages_created_at_idx").on(table.createdAt),
]);
