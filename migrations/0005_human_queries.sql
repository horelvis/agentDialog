-- Add new message types
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'human_query';
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'human_query_response';

-- Create query enums
DO $$ BEGIN
  CREATE TYPE "query_type" AS ENUM ('validation', 'interpretation', 'expert_query', 'labeling');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "query_status" AS ENUM ('pending', 'assigned', 'answered', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create human_queries table
CREATE TABLE IF NOT EXISTS "human_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "human_email" varchar(256) NOT NULL,
  "human_id" uuid REFERENCES "humans"("id"),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "query_message_id" uuid NOT NULL REFERENCES "messages"("id"),
  "response_message_id" uuid REFERENCES "messages"("id"),
  "query_type" "query_type" NOT NULL,
  "status" "query_status" NOT NULL DEFAULT 'pending',
  "question" text NOT NULL,
  "context" text,
  "confidence" real,
  "timeout_minutes" integer NOT NULL DEFAULT 60,
  "expires_at" timestamp with time zone NOT NULL,
  "answer" text,
  "answer_comment" text,
  "answer_confidence" real,
  "response_time_ms" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "human_queries_agent_idx" ON "human_queries" ("agent_id");
CREATE INDEX IF NOT EXISTS "human_queries_human_idx" ON "human_queries" ("human_id");
CREATE INDEX IF NOT EXISTS "human_queries_status_idx" ON "human_queries" ("status");
CREATE INDEX IF NOT EXISTS "human_queries_conversation_idx" ON "human_queries" ("conversation_id");
CREATE INDEX IF NOT EXISTS "human_queries_expires_at_idx" ON "human_queries" ("expires_at");
