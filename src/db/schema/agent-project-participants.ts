import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { agentProjects } from "./agent-projects";
import { agents } from "./agents";
import { participantRoleEnum, participantStatusEnum } from "./enums";

/**
 * Agents invited into a project. Membership is how a participant is allowed to
 * see anything at all: a participant only ever reads the tasks assigned to it,
 * and the lead owns the whole project.
 */
export const agentProjectParticipants = pgTable("agent_project_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => agentProjects.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  role: participantRoleEnum("role").notNull().default("member"),
  status: participantStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("agent_project_participants_project_agent_uk").on(table.projectId, table.agentId),
  index("agent_project_participants_agent_idx").on(table.agentId),
]);