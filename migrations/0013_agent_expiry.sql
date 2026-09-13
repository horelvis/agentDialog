-- Ephemeral agents. There is no delete-agent endpoint, so a self-registered
-- agent that wants to leave sets its own lifetime at registration
-- (expires_in_minutes) and the expiry sweep deactivates it once it passes.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "agents_expires_at_idx" ON "agents" ("expires_at");