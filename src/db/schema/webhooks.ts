import { pgTable, uuid, varchar, jsonb, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import type { SealedSecret } from "../../lib/secret-box";

/**
 * A signing secret, encrypted at rest. A list rather than a value because a
 * rotation keeps the previous secret alive for a grace window and signs with
 * both, so the consumer migrates without dropping a delivery.
 */
export interface StoredSecret extends SealedSecret {
  id: string;
  createdAt: string;
  expiresAt: string | null; // null = live indefinitely
}

export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 512 }).notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secrets: jsonb("secrets").$type<StoredSecret[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("webhooks_agent_idx").on(table.agentId),
  index("webhooks_active_idx").on(table.isActive),
]);
