-- Add the two new query statuses.
ALTER TYPE "query_status" ADD VALUE IF NOT EXISTS 'needs_context' BEFORE 'answered';
ALTER TYPE "query_status" ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'expired';

-- Create the query risk enum.
DO $$ BEGIN
  CREATE TYPE "query_risk" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add the typed-query columns.
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "risk" "query_risk" NOT NULL DEFAULT 'low';
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "subject" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "self_contained" boolean NOT NULL DEFAULT false;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "changes" jsonb;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "answer_space" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "clarification_rounds" integer NOT NULL DEFAULT 0;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "insufficient_reason" varchar(64);

-- Existing answers were prose. Keep them: the history stays readable and the
-- row itself records that it was decided under the old regime.
ALTER TABLE "human_queries"
  ALTER COLUMN "answer" TYPE jsonb
  USING CASE
    WHEN "answer" IS NULL THEN NULL
    ELSE jsonb_build_object('kind', 'text', 'value', "answer")
  END;

UPDATE "human_queries" SET
  "answer_space" = '{"kind":"text","max_length":32000}'::jsonb,
  "self_contained" = true,
  "subject" = jsonb_build_object(
    'id', 'legacy:' || "id"::text,
    'label', left("question", 80)
  )
WHERE "answer_space" = '{}'::jsonb;

-- Index needed by prior-decision detection (Task 5).
CREATE INDEX IF NOT EXISTS "human_queries_subject_idx" ON "human_queries" ("agent_id", "human_email");
