import { pgTable, uuid, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { a2aTasks } from "./a2a-tasks";
import { a2aMessageRoleEnum } from "./enums";

/**
 * Messages exchanged inside an A2A task. The initial message is always from the
 * sending agent (role = user in A2A terms). The recipient can append agent
 * messages for multi-turn coordination.
 */
export const a2aMessages = pgTable("a2a_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => a2aTasks.id, { onDelete: "cascade" }),
  role: a2aMessageRoleEnum("role").notNull(),
  parts: jsonb("parts").$type<Array<Record<string, unknown>>>().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("a2a_messages_task_idx").on(table.taskId),
  index("a2a_messages_role_idx").on(table.role),
  index("a2a_messages_created_at_idx").on(table.createdAt),
]);
