-- A capability to resolve one query, mailed to one address. Scoped on purpose:
-- a forwarded email must not become access to somebody's whole history.

CREATE TABLE IF NOT EXISTS "query_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "query_id" uuid NOT NULL,
  "human_email" varchar(256) NOT NULL,
  "token_prefix" varchar(20) NOT NULL,
  "token_hash" varchar(256) NOT NULL,
  "consumed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "query_grants_token_prefix_unique" UNIQUE("token_prefix")
);

ALTER TABLE "query_grants" ADD CONSTRAINT "query_grants_query_id_human_queries_id_fk"
  FOREIGN KEY ("query_id") REFERENCES "human_queries"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "query_grants_query_idx" ON "query_grants" ("query_id");
CREATE INDEX IF NOT EXISTS "query_grants_prefix_idx" ON "query_grants" ("token_prefix");
