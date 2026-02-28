import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { agentStatusEnum } from "./enums";

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  description: text("description"),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  homepageUrl: varchar("homepage_url", { length: 512 }),
  provider: varchar("provider", { length: 64 }),
  model: varchar("model", { length: 128 }),
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  apiKeyHash: varchar("api_key_hash", { length: 256 }).notNull(),
  apiKeyPrefix: varchar("api_key_prefix", { length: 16 }).notNull(),
  status: agentStatusEnum("status").notNull().default("active"),
  rateLimitRpm: integer("rate_limit_rpm").default(60),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  agentCard: jsonb("agent_card").$type<Record<string, unknown>>(),
  trustScore: integer("trust_score").default(0),
  totalRatings: integer("total_ratings").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("agents_slug_idx").on(table.slug),
  index("agents_status_idx").on(table.status),
  index("agents_api_key_prefix_idx").on(table.apiKeyPrefix),
]);
