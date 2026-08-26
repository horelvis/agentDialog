import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { agents } from "./agents";
import { invitationStatusEnum } from "./enums";

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  invitedByAgentId: uuid("invited_by_agent_id").notNull().references(() => agents.id),
  invitedHumanEmail: varchar("invited_human_email", { length: 256 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  status: invitationStatusEnum("status").notNull().default("pending"),
  message: text("message"),
  language: varchar("language", { length: 8 }).notNull().default("en"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("invitations_conversation_idx").on(table.conversationId),
  index("invitations_token_idx").on(table.token),
  index("invitations_email_idx").on(table.invitedHumanEmail),
  index("invitations_status_idx").on(table.status),
]);
