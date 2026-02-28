import { pgTable, uuid, varchar, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { agents } from "./agents";
import { humans } from "./humans";
import { actorTypeEnum } from "./enums";

export const conversationParticipants = pgTable("conversation_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  actorType: actorTypeEnum("actor_type").notNull(),
  agentId: uuid("agent_id").references(() => agents.id),
  humanId: uuid("human_id").references(() => humans.id),
  role: varchar("role", { length: 32 }).notNull().default("participant"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
}, (table) => [
  index("participants_conversation_idx").on(table.conversationId),
  index("participants_agent_idx").on(table.agentId),
  index("participants_human_idx").on(table.humanId),
]);
