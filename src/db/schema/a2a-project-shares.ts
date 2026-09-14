import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { agentProjects } from "./agent-projects";

/**
 * The capability that reads a project's collaboration contract. The token is
 * stored the way session and query-grant tokens are — an indexed prefix plus a
 * bcrypt hash — never plaintext. The lead generates or rotates it; anyone who
 * holds it can fetch the contract for that one project and nothing else.
 */
export const a2aProjectShares = pgTable("a2a_project_shares", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => agentProjects.id, { onDelete: "cascade" }),
  tokenPrefix: varchar("token_prefix", { length: 20 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 256 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});