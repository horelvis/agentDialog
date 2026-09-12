-- Distributed agent projects: a lead agent creates a project, invites
-- participants by slug, and assigns subtasks that flow through the A2A
-- mailbox. A participant sees only the tasks assigned to it; the lead owns
-- the whole project.

DO $$ BEGIN
  CREATE TYPE "project_status" AS ENUM ('active', 'paused', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "participant_role" AS ENUM ('lead', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "participant_status" AS ENUM ('pending', 'active', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "project_task_status" AS ENUM (
    'pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "agent_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(256) NOT NULL,
  "description" text,
  "status" "project_status" DEFAULT 'active' NOT NULL,
  "lead_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_projects_lead_idx" ON "agent_projects" ("lead_agent_id");
CREATE INDEX IF NOT EXISTS "agent_projects_status_idx" ON "agent_projects" ("status");

CREATE TABLE IF NOT EXISTS "agent_project_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "agent_projects"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "role" "participant_role" DEFAULT 'member' NOT NULL,
  "status" "participant_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_project_participants_project_agent_uk"
  ON "agent_project_participants" ("project_id", "agent_id");
CREATE INDEX IF NOT EXISTS "agent_project_participants_agent_idx"
  ON "agent_project_participants" ("agent_id");

CREATE TABLE IF NOT EXISTS "agent_project_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "agent_projects"("id") ON DELETE CASCADE,
  "a2a_task_id" uuid NOT NULL REFERENCES "a2a_tasks"("id") ON DELETE CASCADE,
  "title" varchar(256) NOT NULL,
  "description" text,
  "assignee_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "status" "project_task_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_project_tasks_project_idx" ON "agent_project_tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "agent_project_tasks_assignee_idx" ON "agent_project_tasks" ("assignee_agent_id");
CREATE INDEX IF NOT EXISTS "agent_project_tasks_a2a_task_idx" ON "agent_project_tasks" ("a2a_task_id");