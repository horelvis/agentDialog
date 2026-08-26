-- The language the product wraps an agent's words in. It never governs the
-- agent's own text: the question, the subject and the options travel as sent.
--
-- varchar(8) for values of two letters on purpose: widening the catalogue to
-- something like pt-BR should cost an enum entry, not another migration.
ALTER TABLE "human_queries" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'en' NOT NULL;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'en' NOT NULL;
