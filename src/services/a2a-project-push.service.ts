import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { a2aProjectPushConfigs } from "../db/schema/a2a-project-push-configs";
import { agentProjectParticipants } from "../db/schema/agent-project-participants";
import { NotFoundError, ForbiddenError, ValidationError } from "../lib/errors";
import { inspectWebhookTarget } from "../lib/webhook-url-guard";
import type { PushConfig } from "./a2a-delivery.service";

/**
 * One callback per (project, participant): where that participant wants events
 * about the project delivered. `task_new` reaches the assignee; task status,
 * artifact and message changes reach the sender. Replaces the per-task push
 * configs — register once per project, not once per task.
 */

export interface PublicProjectPushConfig {
  id: string;
  projectId: string;
  agentId: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectPushConfigInput {
  projectId: string;
  agentId: string;
  url: string;
  authInfo?: Record<string, unknown>;
}

export function publicProjectPushConfig(
  row: typeof a2aProjectPushConfigs.$inferSelect,
): PublicProjectPushConfig {
  return {
    id: row.id,
    projectId: row.projectId,
    agentId: row.agentId,
    url: row.url,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertActiveParticipant(projectId: string, agentId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentProjectParticipants)
    .where(
      and(
        eq(agentProjectParticipants.projectId, projectId),
        eq(agentProjectParticipants.agentId, agentId),
        eq(agentProjectParticipants.status, "active"),
      ),
    )
    .limit(1);

  if (!row) throw new ForbiddenError("Agent is not an active participant of this project");
}

/** Register or replace the caller's project callback. Active participant only. */
export async function upsertProjectPushConfig(
  projectId: string,
  agentId: string,
  url: string,
  authInfo?: Record<string, unknown>,
): Promise<PublicProjectPushConfig> {
  await assertActiveParticipant(projectId, agentId);

  const verdict = await inspectWebhookTarget(url);
  if (!verdict.allowed) {
    throw new ValidationError(verdict.reason!);
  }

  const db = getDb();
  const [row] = await db
    .insert(a2aProjectPushConfigs)
    .values({ projectId, agentId, url, authInfo: authInfo ?? null })
    .onConflictDoUpdate({
      target: [a2aProjectPushConfigs.projectId, a2aProjectPushConfigs.agentId],
      set: { url, authInfo: authInfo ?? null, updatedAt: new Date() },
    })
    .returning();

  return publicProjectPushConfig(row);
}

export async function getProjectPushConfig(
  projectId: string,
  agentId: string,
): Promise<PublicProjectPushConfig | null> {
  await assertActiveParticipant(projectId, agentId);

  const db = getDb();
  const [row] = await db
    .select()
    .from(a2aProjectPushConfigs)
    .where(and(eq(a2aProjectPushConfigs.projectId, projectId), eq(a2aProjectPushConfigs.agentId, agentId)))
    .limit(1);

  return row ? publicProjectPushConfig(row) : null;
}

export async function deleteProjectPushConfig(projectId: string, agentId: string): Promise<void> {
  await assertActiveParticipant(projectId, agentId);

  const db = getDb();
  const result = await db
    .delete(a2aProjectPushConfigs)
    .where(and(eq(a2aProjectPushConfigs.projectId, projectId), eq(a2aProjectPushConfigs.agentId, agentId)))
    .returning({ id: a2aProjectPushConfigs.id });

  if (result.length === 0) throw new NotFoundError("Project push config", agentId);
}

/**
 * The delivery path — internal, no participation assertion: the caller (the
 * mailbox) already knows the participant from the task's sender/recipient.
 */
export async function getProjectPushConfigFor(projectId: string, agentId: string): Promise<PushConfig | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(a2aProjectPushConfigs)
    .where(and(eq(a2aProjectPushConfigs.projectId, projectId), eq(a2aProjectPushConfigs.agentId, agentId)))
    .limit(1);

  if (!row) return null;
  return { url: row.url, authInfo: row.authInfo ? (row.authInfo as Record<string, unknown>) : undefined };
}