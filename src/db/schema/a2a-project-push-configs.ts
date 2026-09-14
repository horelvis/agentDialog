import { pgTable, uuid, varchar, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { agentProjects } from "./agent-projects";
import { agents } from "./agents";

/**
 * One callback per (project, participant). This is where a participant wants
 * events about that project delivered: `task_new` reaches the assignee, and
 * task status/artifact/message changes reach the sender. Replaces the old
 * per-task push configs, which made collaboration mechanical — register once
 * per project, not once per task.
 */
export const a2aProjectPushConfigs = pgTable("a2a_project_push_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => agentProjects.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 512 }).notNull(),
  // Hash of the authentication secret/token; the plaintext secret is held in
  // memory only while delivering. We never store unencrypted bearer tokens.
  authInfo: jsonb("auth_info").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("a2a_project_push_configs_project_agent_uk").on(table.projectId, table.agentId),
  index("a2a_project_push_configs_agent_idx").on(table.agentId),
]);