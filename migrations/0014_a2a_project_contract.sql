-- Project collaboration contracts and project-level push notifications.
-- Replaces the per-task A2A push configs, which made coordination mechanical:
-- now a participant registers one callback per project and receives task_new
-- (as assignee) and task status/artifact/message changes (as sender).
--
-- BREAKING: the per-task a2a_push_configs table is dropped. The A2A feature is
-- new and self-service; existing per-task callbacks must be re-registered at
-- the project level.

CREATE TABLE IF NOT EXISTS "a2a_project_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL UNIQUE REFERENCES "agent_projects"("id") ON DELETE CASCADE,
  "token_prefix" varchar(20) NOT NULL UNIQUE,
  "token_hash" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "a2a_project_push_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "agent_projects"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "url" varchar(512) NOT NULL,
  "auth_info" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "a2a_project_push_configs_project_agent_uk" UNIQUE ("project_id", "agent_id")
);

CREATE INDEX IF NOT EXISTS "a2a_project_push_configs_agent_idx" ON "a2a_project_push_configs" ("agent_id");

-- The collaboration contract's rules: Markdown written by the project lead,
-- served inside the contract document. A dedicated column so the prose never
-- shares storage with the structured project metadata.
ALTER TABLE "agent_projects" ADD COLUMN IF NOT EXISTS "contract_rules" text;

DROP TABLE IF EXISTS "a2a_push_configs";