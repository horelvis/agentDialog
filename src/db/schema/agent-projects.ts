import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { projectStatusEnum } from "./enums";

/**
 * A distributed agent project. The lead agent creates it, invites participant
 * agents by slug, and assigns subtasks that are delivered through the A2A
 * mailbox. AgentDialog tracks the project and its tasks; it never runs the work.
 */
export const agentProjects = pgTable("agent_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default("active"),
  leadAgentId: uuid("lead_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("agent_projects_lead_idx").on(table.leadAgentId),
  index("agent_projects_status_idx").on(table.status),
]);