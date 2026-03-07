ALTER TABLE "humans" RENAME COLUMN "magic_link_token" TO "verification_code_hash";--> statement-breakpoint
ALTER TABLE "humans" RENAME COLUMN "magic_link_expires_at" TO "verification_code_expires_at";--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "verification_attempts" integer DEFAULT 0 NOT NULL;
