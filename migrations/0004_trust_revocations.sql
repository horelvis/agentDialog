CREATE TABLE IF NOT EXISTS "agent_trust_revocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_trust_revocations_agent_human_unique" UNIQUE("agent_id", "human_id")
);
