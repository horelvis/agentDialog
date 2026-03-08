import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { humans } from "./humans";

export const agentTrustRevocations = pgTable("agent_trust_revocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  humanId: uuid("human_id").notNull().references(() => humans.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("agent_trust_revocations_agent_human_unique").on(table.agentId, table.humanId),
]);
