import { pgTable, uuid, varchar, jsonb, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 512 }).notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secretHash: varchar("secret_hash", { length: 256 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("webhooks_agent_idx").on(table.agentId),
  index("webhooks_active_idx").on(table.isActive),
]);
