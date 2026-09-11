import { pgTable, uuid, varchar, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { a2aTasks } from "./a2a-tasks";

/**
 * Artifacts produced by the recipient agent as a result of an A2A task.
 * An artifact is composed of A2A Parts and may be streamed in chunks.
 */
export const a2aArtifacts = pgTable("a2a_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => a2aTasks.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }),
  description: varchar("description", { length: 1024 }),
  parts: jsonb("parts").$type<Array<Record<string, unknown>>>().notNull(),
  index: integer("index").notNull().default(0),
  append: integer("append").notNull().default(0),
  lastChunk: integer("last_chunk"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("a2a_artifacts_task_idx").on(table.taskId),
  index("a2a_artifacts_task_index_idx").on(table.taskId, table.index),
]);
