import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

export const oauthClients = pgTable("oauth_clients", {
  clientId: varchar("client_id", { length: 64 }).primaryKey(),
  clientSecret: varchar("client_secret", { length: 128 }).notNull(),
  redirectUris: text("redirect_uris").notNull(), // JSON array
  clientName: varchar("client_name", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthCodes = pgTable("oauth_codes", {
  code: varchar("code", { length: 64 }).primaryKey(),
  clientId: varchar("client_id", { length: 64 }).notNull(),
  apiKey: varchar("api_key", { length: 256 }).notNull(),
  codeChallenge: varchar("code_challenge", { length: 256 }).notNull(),
  codeChallengeMethod: varchar("code_challenge_method", { length: 16 }).notNull().default("S256"),
  redirectUri: text("redirect_uri").notNull(),
  state: varchar("state", { length: 256 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("oauth_codes_expires_at_idx").on(table.expiresAt),
]);
