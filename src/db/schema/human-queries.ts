import { pgTable, uuid, varchar, text, real, integer, jsonb, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { humans } from "./humans";
import { conversations } from "./conversations";
import { messages } from "./messages";
import { queryTypeEnum, queryStatusEnum, queryRiskEnum } from "./enums";

export const humanQueries = pgTable("human_queries", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  humanEmail: varchar("human_email", { length: 256 }).notNull(),
  humanId: uuid("human_id").references(() => humans.id),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  queryMessageId: uuid("query_message_id").notNull().references(() => messages.id),
  responseMessageId: uuid("response_message_id").references(() => messages.id),
  queryType: queryTypeEnum("query_type").notNull(),
  status: queryStatusEnum("status").notNull().default("pending"),
  question: text("question").notNull(),
  context: text("context"),
  risk: queryRiskEnum("risk").notNull().default("low"),
  subject: jsonb("subject").$type<Record<string, unknown>>().notNull().default({}),
  selfContained: boolean("self_contained").notNull().default(false),
  changes: jsonb("changes").$type<Array<Record<string, unknown>>>(),
  // Defaults to the text space: a row written by code that predates the
  // typed answer-space work is genuinely a prose query, and this is its
  // honest description — the same one the migration gives legacy rows.
  answerSpace: jsonb("answer_space").$type<Record<string, unknown>>().notNull()
    .default({ kind: "text", max_length: 32000 }),
  clarificationRounds: integer("clarification_rounds").notNull().default(0),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  insufficientReason: varchar("insufficient_reason", { length: 64 }),
  confidence: real("confidence"),
  timeoutMinutes: integer("timeout_minutes").notNull().default(60),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  answer: jsonb("answer").$type<Record<string, unknown>>(),
  answerComment: text("answer_comment"),
  answerConfidence: real("answer_confidence"),
  responseTimeMs: integer("response_time_ms"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("human_queries_agent_idx").on(table.agentId),
  index("human_queries_human_idx").on(table.humanId),
  index("human_queries_status_idx").on(table.status),
  index("human_queries_conversation_idx").on(table.conversationId),
  index("human_queries_expires_at_idx").on(table.expiresAt),
  // Prior-decision detection: (agent_id, human_email), narrowed further by a
  // jsonb predicate on subject->>'id'. Named for what it indexes; it used to
  // be called human_queries_subject_idx, which is the one column it does not.
  index("human_queries_agent_human_idx").on(table.agentId, table.humanEmail),
]);
