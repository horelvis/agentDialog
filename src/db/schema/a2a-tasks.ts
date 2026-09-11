import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { a2aTaskStateEnum } from "./enums";

/**
 * A task dropped into an agent's A2A mailbox by another registered agent.
 * AgentDialog only routes and tracks the task; it does not process it.
 */
export const a2aTasks = pgTable("a2a_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipientAgentId: uuid("recipient_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  senderAgentId: uuid("sender_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  contextId: varchar("context_id", { length: 256 }),
  sessionId: varchar("session_id", { length: 256 }),
  state: a2aTaskStateEnum("state").notNull().default("submitted"),
  statusMessage: jsonb("status_message").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("a2a_tasks_recipient_state_idx").on(table.recipientAgentId, table.state),
  index("a2a_tasks_sender_idx").on(table.senderAgentId),
  index("a2a_tasks_context_idx").on(table.contextId),
  index("a2a_tasks_created_at_idx").on(table.createdAt),
]);
