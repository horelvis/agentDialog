import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { humanQueries } from "./human-queries";

/**
 * One row per (query, invited address). The token is stored the way session
 * tokens are — an indexed prefix plus a bcrypt hash — and NOT the way
 * `invitations.token` is, which is plaintext. That is a known problem; new code
 * does not inherit it.
 */
export const queryGrants = pgTable("query_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  queryId: uuid("query_id").notNull().references(() => humanQueries.id, { onDelete: "cascade" }),
  humanEmail: varchar("human_email", { length: 256 }).notNull(),
  tokenPrefix: varchar("token_prefix", { length: 20 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 256 }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("query_grants_query_idx").on(table.queryId),
  index("query_grants_prefix_idx").on(table.tokenPrefix),
]);
