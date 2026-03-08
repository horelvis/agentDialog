ALTER TABLE "humans" ADD COLUMN "session_token_prefix" varchar(20);--> statement-breakpoint
CREATE INDEX "humans_session_prefix_idx" ON "humans" USING btree ("session_token_prefix");
