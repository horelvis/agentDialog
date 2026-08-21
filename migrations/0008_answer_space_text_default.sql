-- Fix-up for 0007: answer_space's default was originally '{}', which meant
-- any row written by code that predates the typed answer-space work (i.e.
-- everything until Task 6 lands) got an unusable "no answer space at all"
-- instead of an honest description of what it actually is: a prose query.
-- Change the default and backfill accordingly. All three statements below
-- are no-ops on a database that ran the corrected 0007 from scratch — they
-- exist to bring a database that already ran the old 0007 into the same
-- end state.

ALTER TABLE "human_queries"
  ALTER COLUMN "answer_space" SET DEFAULT '{"kind":"text","max_length":32000}'::jsonb;

-- subject still defaults to '{}' and nothing sets it to anything else before
-- Task 4/5 land, so it remains the marker for "not yet classified under the
-- typed regime" regardless of when the row was created.
UPDATE "human_queries" SET
  "answer_space" = '{"kind":"text","max_length":32000}'::jsonb,
  "self_contained" = true,
  "subject" = jsonb_build_object(
    'id', 'legacy:' || "id"::text,
    'label', left("question", 80)
  )
WHERE "subject" = '{}'::jsonb;

-- Rows answered between the original 0007 apply and the query.service.ts fix
-- (Task 3 follow-up) got a bare jsonb string instead of {kind:text,value:...}
-- because respondQuery had not been updated yet. Give them the same shape.
UPDATE "human_queries" SET
  "answer" = jsonb_build_object('kind', 'text', 'value', "answer" #>> '{}')
WHERE "status" = 'answered' AND "answer" IS NOT NULL AND "answer"->>'kind' IS NULL;
