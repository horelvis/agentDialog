-- A2A mailbox: tasks routed between registered agents, plus the messages,
-- artifacts and push notification configs attached to each task. AgentDialog
-- only stores and routes; it never processes the work.

DO $$ BEGIN
  CREATE TYPE "a2a_task_state" AS ENUM (
    'submitted', 'working', 'input_required', 'completed', 'failed', 'canceled', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "a2a_message_role" AS ENUM ('user', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "a2a_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "sender_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "context_id" varchar(256),
  "session_id" varchar(256),
  "state" "a2a_task_state" DEFAULT 'submitted' NOT NULL,
  "status_message" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_tasks_recipient_state_idx" ON "a2a_tasks" ("recipient_agent_id", "state");
CREATE INDEX IF NOT EXISTS "a2a_tasks_sender_idx" ON "a2a_tasks" ("sender_agent_id");
CREATE INDEX IF NOT EXISTS "a2a_tasks_context_idx" ON "a2a_tasks" ("context_id");
CREATE INDEX IF NOT EXISTS "a2a_tasks_created_at_idx" ON "a2a_tasks" ("created_at");

CREATE TABLE IF NOT EXISTS "a2a_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "a2a_tasks"("id") ON DELETE CASCADE,
  "role" "a2a_message_role" NOT NULL,
  "parts" jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_messages_task_idx" ON "a2a_messages" ("task_id");
CREATE INDEX IF NOT EXISTS "a2a_messages_role_idx" ON "a2a_messages" ("role");
CREATE INDEX IF NOT EXISTS "a2a_messages_created_at_idx" ON "a2a_messages" ("created_at");

CREATE TABLE IF NOT EXISTS "a2a_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "a2a_tasks"("id") ON DELETE CASCADE,
  "name" varchar(256),
  "description" varchar(1024),
  "parts" jsonb NOT NULL,
  "index" integer DEFAULT 0 NOT NULL,
  "append" integer DEFAULT 0 NOT NULL,
  "last_chunk" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_artifacts_task_idx" ON "a2a_artifacts" ("task_id");
CREATE INDEX IF NOT EXISTS "a2a_artifacts_task_index_idx" ON "a2a_artifacts" ("task_id", "index");

CREATE TABLE IF NOT EXISTS "a2a_push_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "a2a_tasks"("id") ON DELETE CASCADE,
  "url" varchar(512) NOT NULL,
  "auth_info_hash" varchar(256),
  "auth_info" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_push_configs_task_idx" ON "a2a_push_configs" ("task_id");
CREATE INDEX IF NOT EXISTS "a2a_push_configs_url_idx" ON "a2a_push_configs" ("url");