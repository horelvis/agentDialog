import { pgTable, uuid, varchar, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";

export const humans = pgTable("humans", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 256 }).notNull().unique(),
  displayName: varchar("display_name", { length: 128 }),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  verificationCodeHash: varchar("verification_code_hash", { length: 256 }),
  verificationCodeExpiresAt: timestamp("verification_code_expires_at", { withTimezone: true }),
  verificationAttempts: integer("verification_attempts").default(0).notNull(),
  sessionTokenHash: varchar("session_token_hash", { length: 256 }),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("humans_email_idx").on(table.email),
]);
