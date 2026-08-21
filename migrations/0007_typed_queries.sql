-- Typed queries: the columns, the two new statuses, and the backfill that
-- keeps every pre-existing row readable.
--
-- Every statement here is safe to run twice. That is not decoration: this
-- migration replaces a pair (0007 plus an 0008 that patched a mistake in the
-- first) that had already been applied to the development and test databases
-- before the pair was squashed, so it has to reach the same end state whether
-- it lands on an empty database or on one that already ran the pair.

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
-- Defaults to the text space: a row written before the typed answer-space
-- work genuinely is a prose query, and this is its honest description.
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "answer_space" jsonb NOT NULL DEFAULT '{"kind":"text","max_length":32000}'::jsonb;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "clarification_rounds" integer NOT NULL DEFAULT 0;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "insufficient_reason" varchar(64);

-- ADD COLUMN IF NOT EXISTS leaves an existing column's default alone, so a
-- database that ran the earlier pair still carries the old '{}' default here.
-- Set it explicitly.
ALTER TABLE "human_queries"
  ALTER COLUMN "answer_space" SET DEFAULT '{"kind":"text","max_length":32000}'::jsonb;

-- Existing answers were prose. Keep them: the history stays readable and the
-- row itself records that it was decided under the old regime.
--
-- Guarded on the current column type, because this is the one statement here
-- that is destructive if repeated: running the USING expression over a column
-- that is already jsonb would wrap {"kind":"text","value":"…"} inside another
-- {"kind":"text","value":…}.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'human_queries' AND column_name = 'answer' AND data_type <> 'jsonb'
  ) THEN
    ALTER TABLE "human_queries"
      ALTER COLUMN "answer" TYPE jsonb
      USING CASE
        WHEN "answer" IS NULL THEN NULL
        ELSE jsonb_build_object('kind', 'text', 'value', "answer")
      END;
  END IF;
END $$;

-- answer_space defaults to the text space for everyone now, so it no longer
-- distinguishes a legacy row from anything else. subject still defaults to
-- '{}', so it is the marker for "not yet touched by this backfill".
UPDATE "human_queries" SET
  "answer_space" = '{"kind":"text","max_length":32000}'::jsonb,
  "self_contained" = true,
  "subject" = jsonb_build_object(
    'id', 'legacy:' || "id"::text,
    'label', left("question", 80)
  )
WHERE "subject" = '{}'::jsonb;

-- An answered row whose answer is still a bare jsonb string rather than the
-- {kind, value} shape. Reachable on a database that ran the earlier pair, and
-- a no-op anywhere else.
UPDATE "human_queries" SET
  "answer" = jsonb_build_object('kind', 'text', 'value', "answer" #>> '{}')
WHERE "status" = 'answered' AND "answer" IS NOT NULL AND "answer"->>'kind' IS NULL;

-- The index prior-decision detection needs. It is on (agent_id, human_email);
-- it was called human_queries_subject_idx, which is the one thing it does not
-- index. Renamed where it already exists, created where it does not.
ALTER INDEX IF EXISTS "human_queries_subject_idx" RENAME TO "human_queries_agent_human_idx";
CREATE INDEX IF NOT EXISTS "human_queries_agent_human_idx" ON "human_queries" ("agent_id", "human_email");
