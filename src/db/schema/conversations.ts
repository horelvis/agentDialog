import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { conversationStatusEnum } from "./enums";

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdByAgentId: uuid("created_by_agent_id").notNull().references(() => agents.id),
  title: varchar("title", { length: 256 }),
  description: text("description"),
  status: conversationStatusEnum("status").notNull().default("active"),
  context: jsonb("context").$type<Record<string, unknown>>().default({}),
  intentType: varchar("intent_type", { length: 64 }),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("conversations_created_by_idx").on(table.createdByAgentId),
  index("conversations_status_idx").on(table.status),
]);
