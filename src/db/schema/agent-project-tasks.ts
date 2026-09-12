import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { agentProjects } from "./agent-projects";
import { a2aTasks } from "./a2a-tasks";
import { agents } from "./agents";
import { projectTaskStatusEnum } from "./enums";

/**
 * A subtask inside a project. It is the lead's view of an A2A task: the same
 * delivery flows through a2aTasks; project_tasks adds the assignment context
 * (which participant owns it, where it lives in the project) without duplicating
 * the mailbox itself.
 */
export const agentProjectTasks = pgTable("agent_project_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => agentProjects.id, { onDelete: "cascade" }),
  a2aTaskId: uuid("a2a_task_id").notNull().references(() => a2aTasks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  assigneeAgentId: uuid("assignee_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  status: projectTaskStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("agent_project_tasks_project_idx").on(table.projectId),
  index("agent_project_tasks_assignee_idx").on(table.assigneeAgentId),
  index("agent_project_tasks_a2a_task_idx").on(table.a2aTaskId),
]);