import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { a2aTasks } from "./a2a-tasks";

/**
 * Push notification subscriptions for an A2A task. A client registers a URL
 * where AgentDialog POSTs task status and artifact updates.
 */
export const a2aPushConfigs = pgTable("a2a_push_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => a2aTasks.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 512 }).notNull(),
  // Hash of the authentication secret/token; the plaintext secret is held in
  // memory only while delivering. We never store unencrypted bearer tokens.
  authInfoHash: varchar("auth_info_hash", { length: 256 }),
  authInfo: jsonb("auth_info").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("a2a_push_configs_task_idx").on(table.taskId),
  index("a2a_push_configs_url_idx").on(table.url),
]);
