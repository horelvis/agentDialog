import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { messages } from "./messages";

export const fileAttachments = pgTable("file_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 256 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  storageBucket: varchar("storage_bucket", { length: 128 }).notNull(),
  thumbnailKey: varchar("thumbnail_key", { length: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("file_attachments_message_idx").on(table.messageId),
]);
