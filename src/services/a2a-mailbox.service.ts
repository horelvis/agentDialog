import { eq, and, asc, desc } from "drizzle-orm";
import { getDb } from "../db";
import { a2aTasks, a2aMessages, a2aArtifacts } from "../db/schema";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors";
import { getRedis } from "../lib/redis";
import {
  A2A_ARTIFACT_EVENT,
  A2A_MESSAGE_EVENT,
  A2A_STATUS_EVENT,
  A2A_TASK_NEW_EVENT,
  buildArtifactUpdatePayload,
  buildEventEnvelope,
  buildMessageUpdatePayload,
  buildProjectEventEnvelope,
  buildStatusUpdatePayload,
  deliverProjectPushNotifications,
  publishTaskEvent,
  type MessageUpdateEvent,
} from "./a2a-delivery.service";
import { getProjectPushConfigFor } from "./a2a-project-push.service";
import {
  a2aStateFromInternal,
  internalStateFromA2a,
  isTerminalInternalState,
  type Artifact,
  type Message,
  type Part,
  type SendMessageRequest,
  type Task,
  type TaskArtifactUpdateEvent,
  type TaskState,
  type TaskStatus,
  type TaskStatusUpdateEvent,
} from "@/lib/a2a";

export interface ListTasksFilters {
  contextId?: string;
  state?: TaskState;
  limit?: number;
  offset?: number;
}

/**
 * The A2A mailbox service stores, routes and tracks tasks between registered
 * agents. It never runs an LLM or processes the work itself; the recipient agent
 * reads its mailbox through the owner endpoints and updates the task.
 */

export async function sendMessage(
  recipientAgentId: string,
  senderAgentId: string,
  request: SendMessageRequest,
): Promise<Task> {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(a2aTasks)
      .values({
        recipientAgentId,
        senderAgentId,
        contextId: request.contextId ?? null,
        sessionId: request.sessionId ?? null,
        state: "submitted",
        metadata: request.metadata ?? {},
      })
      .returning();

    await tx.insert(a2aMessages).values({
      taskId: task.id,
      role: "user",
      parts: request.message.parts as Array<Record<string, unknown>>,
      metadata: request.message.metadata ?? {},
    });

    return task;
  });

  // A task that carries a project id belongs to a collaboration; its assignee
  // learns about it instead of polling its mailbox. Tasks outside any project
  // keep the old contract: SSE for the sender, polling for the recipient.
  const projectId = projectIdOf(result.metadata);
  if (projectId) {
    await notifyTaskNew({ recipientAgentId, taskId: result.id, projectId });
  }

  return getTaskResponse(result.id);
}

export async function getTaskAsSender(taskId: string, senderAgentId: string): Promise<Task> {
  const task = await fetchTaskRow(taskId);
  if (task.senderAgentId !== senderAgentId) {
    throw new ForbiddenError("Task does not belong to this sender");
  }
  return buildFullTaskResponse(task);
}

export async function getTaskAsRecipient(taskId: string, recipientAgentId: string): Promise<Task> {
  const task = await fetchTaskRow(taskId);
  if (task.recipientAgentId !== recipientAgentId) {
    throw new ForbiddenError("Task is not addressed to this agent");
  }
  return buildFullTaskResponse(task);
}

export async function listTasksAsSender(senderAgentId: string, filters: ListTasksFilters = {}): Promise<Task[]> {
  const rows = await fetchTaskRows({ senderAgentId, ...filters });
  const tasks: Task[] = [];
  for (const row of rows) {
    tasks.push(await buildFullTaskResponse(row));
  }
  return tasks;
}

export async function listTasksAsRecipient(recipientAgentId: string, filters: ListTasksFilters = {}): Promise<Task[]> {
  const rows = await fetchTaskRows({ recipientAgentId, ...filters });
  const tasks: Task[] = [];
  for (const row of rows) {
    tasks.push(await buildFullTaskResponse(row));
  }
  return tasks;
}

export async function cancelTaskAsSender(taskId: string, senderAgentId: string): Promise<Task> {
  const task = await fetchTaskRow(taskId);
  assertSenderAccess(task, senderAgentId);
  await updateTaskState(taskId, "canceled");
  return getTaskAsSender(taskId, senderAgentId);
}

export async function cancelTaskAsRecipient(taskId: string, recipientAgentId: string): Promise<Task> {
  const task = await fetchTaskRow(taskId);
  assertRecipientAccess(task, recipientAgentId);
  await updateTaskState(taskId, "canceled");
  return getTaskAsRecipient(taskId, recipientAgentId);
}

export async function updateTaskStatus(
  recipientAgentId: string,
  taskId: string,
  status: TaskStatus,
): Promise<Task> {
  const task = await fetchTaskRow(taskId);
  assertRecipientAccess(task, recipientAgentId);

  const newState = internalStateFromA2a(status.state);
  if (isTerminalInternalState(task.state) && task.state !== newState) {
    throw new ConflictError(`Task is already in terminal state ${task.state}`);
  }

  const db = getDb();
  await db
    .update(a2aTasks)
    .set({
      state: newState,
      statusMessage: status.message ? (status.message as Record<string, unknown>) : null,
      updatedAt: new Date(),
    })
    .where(eq(a2aTasks.id, taskId));

  const updatedTask = await getTaskAsRecipient(taskId, recipientAgentId);
  await notifyTaskChange(taskId, A2A_STATUS_EVENT, buildStatusUpdatePayload(updatedTask.status));
  return updatedTask;
}

export async function addTaskMessage(
  recipientAgentId: string,
  taskId: string,
  message: Message,
): Promise<Message> {
  const task = await fetchTaskRow(taskId);
  assertRecipientAccess(task, recipientAgentId);
  assertNotTerminal(task, "Cannot add messages to a terminal task");

  const db = getDb();
  const [row] = await db
    .insert(a2aMessages)
    .values({
      taskId,
      role: message.role === "agent" ? "agent" : "user",
      parts: message.parts as Array<Record<string, unknown>>,
      metadata: message.metadata ?? {},
    })
    .returning();

  const response = buildMessageResponse(row);
  await notifyTaskChange(taskId, A2A_MESSAGE_EVENT, buildMessageUpdatePayload(response));
  return response;
}

export async function addTaskArtifact(
  recipientAgentId: string,
  taskId: string,
  artifact: Artifact,
): Promise<Artifact> {
  const task = await fetchTaskRow(taskId);
  assertRecipientAccess(task, recipientAgentId);
  assertNotTerminal(task, "Cannot add artifacts to a terminal task");

  const db = getDb();
  const [row] = await db
    .insert(a2aArtifacts)
    .values({
      taskId,
      name: artifact.name ?? null,
      description: artifact.description ?? null,
      parts: artifact.parts as Array<Record<string, unknown>>,
      index: artifact.index ?? 0,
      append: artifact.append ? 1 : 0,
      lastChunk: artifact.lastChunk ? 1 : 0,
    })
    .returning();

  const response = buildArtifactResponse(row);
  await notifyTaskChange(taskId, A2A_ARTIFACT_EVENT, buildArtifactUpdatePayload(response));
  return response;
}

/**
 * Build the public Task object for a single task row, including its messages
 * and artifacts.
 */
export async function getTaskResponse(taskId: string): Promise<Task> {
  const task = await fetchTaskRow(taskId);
  return buildFullTaskResponse(task);
}

/**
 * A task response that carries its messages and artifacts. Every task-facing
 * entry point uses this, so a client never sees a task stripped of its thread
 * and deliverables.
 */
async function buildFullTaskResponse(task: typeof a2aTasks.$inferSelect): Promise<Task> {
  const db = getDb();
  const [messages, artifacts] = await Promise.all([
    db.select().from(a2aMessages).where(eq(a2aMessages.taskId, task.id)).orderBy(asc(a2aMessages.createdAt)),
    db.select().from(a2aArtifacts).where(eq(a2aArtifacts.taskId, task.id)).orderBy(asc(a2aArtifacts.index)),
  ]);
  return buildTaskResponse(task, messages, artifacts);
}

async function fetchTaskRow(taskId: string) {
  const db = getDb();
  const [task] = await db.select().from(a2aTasks).where(eq(a2aTasks.id, taskId)).limit(1);
  if (!task) throw new NotFoundError("A2A task", taskId);
  return task;
}

interface FetchFilters extends ListTasksFilters {
  senderAgentId?: string;
  recipientAgentId?: string;
}

async function fetchTaskRows(filters: FetchFilters) {
  const db = getDb();
  const conditions = [];

  if (filters.senderAgentId) conditions.push(eq(a2aTasks.senderAgentId, filters.senderAgentId));
  if (filters.recipientAgentId) conditions.push(eq(a2aTasks.recipientAgentId, filters.recipientAgentId));
  if (filters.contextId) conditions.push(eq(a2aTasks.contextId, filters.contextId));
  if (filters.state) {
    const internal = internalStateFromA2a(filters.state);
    conditions.push(eq(a2aTasks.state, internal));
  }

  const query = db
    .select()
    .from(a2aTasks)
    .orderBy(desc(a2aTasks.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  return conditions.length > 0 ? await query.where(and(...conditions)) : await query;
}

async function updateTaskState(taskId: string, state: ReturnType<typeof internalStateFromA2a> extends infer R ? R : never) {
  const db = getDb();
  const task = await fetchTaskRow(taskId);
  if (isTerminalInternalState(task.state)) {
    throw new ConflictError(`Task is already in terminal state ${task.state}`);
  }
  await db.update(a2aTasks).set({ state, updatedAt: new Date() }).where(eq(a2aTasks.id, taskId));
}

function assertSenderAccess(task: typeof a2aTasks.$inferSelect, senderAgentId: string) {
  if (task.senderAgentId !== senderAgentId) {
    throw new ForbiddenError("Task does not belong to this sender");
  }
}

function assertRecipientAccess(task: typeof a2aTasks.$inferSelect, recipientAgentId: string) {
  if (task.recipientAgentId !== recipientAgentId) {
    throw new ForbiddenError("Task is not addressed to this agent");
  }
}

function assertNotTerminal(task: typeof a2aTasks.$inferSelect, message: string) {
  if (isTerminalInternalState(task.state)) {
    throw new ConflictError(message);
  }
}

export function buildTaskResponse(
  task: typeof a2aTasks.$inferSelect,
  messages: Array<typeof a2aMessages.$inferSelect> = [],
  artifacts: Array<typeof a2aArtifacts.$inferSelect> = [],
): Task {
  const status: TaskStatus = {
    state: a2aStateFromInternal(task.state),
    message: task.statusMessage ? (task.statusMessage as unknown as Message) : undefined,
  };

  return {
    id: task.id,
    contextId: task.contextId ?? undefined,
    sessionId: task.sessionId ?? undefined,
    status,
    messages: messages.map(buildMessageResponse),
    artifacts: artifacts.map(buildArtifactResponse),
    metadata: task.metadata ?? undefined,
  };
}

export function buildMessageResponse(row: typeof a2aMessages.$inferSelect): Message {
  return {
    messageId: row.id,
    role: row.role === "agent" ? "agent" : "user",
    parts: row.parts as unknown as Part[],
    metadata: row.metadata ?? undefined,
  };
}

export function buildArtifactResponse(row: typeof a2aArtifacts.$inferSelect): Artifact {
  return {
    artifactId: row.id,
    name: row.name ?? undefined,
    description: row.description ?? undefined,
    parts: row.parts as unknown as Part[],
    index: row.index ?? undefined,
    append: row.append === 1,
    lastChunk: row.lastChunk === 1 ? true : row.lastChunk === 0 ? false : undefined,
  };
}

/**
 * The project id a task belongs to, if any. The project service stamps it on
 * every task it sends (metadata: { projectId, ... }); only those tasks are
 * part of a collaboration and get project-level notifications.
 */
function projectIdOf(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.projectId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function notifyTaskNew(input: { recipientAgentId: string; taskId: string; projectId: string }) {
  const config = await getProjectPushConfigFor(input.projectId, input.recipientAgentId);
  if (!config) return;

  const envelope = buildProjectEventEnvelope({
    event: A2A_TASK_NEW_EVENT,
    projectId: input.projectId,
    taskId: input.taskId,
    payload: { taskId: input.taskId },
  });
  deliverProjectPushNotifications([config], envelope).catch((err) => {
    console.error(`A2A task_new delivery failed for task ${input.taskId}:`, err);
  });
}

async function notifyTaskChange(
  taskId: string,
  eventType: typeof A2A_STATUS_EVENT | typeof A2A_ARTIFACT_EVENT | typeof A2A_MESSAGE_EVENT,
  payload: TaskStatusUpdateEvent | TaskArtifactUpdateEvent | MessageUpdateEvent,
): Promise<void> {
  const redis = getRedis();
  await publishTaskEvent(redis, taskId, eventType, payload);

  // Project-level push to the task's sender: this is the participant who sent
  // the task and wants to know it progressed. Tasks outside a project keep
  // SSE as their only push.
  const task = await fetchTaskRow(taskId);
  const projectId = projectIdOf(task.metadata);
  if (!projectId) return;

  const config = await getProjectPushConfigFor(projectId, task.senderAgentId);
  if (!config) return;

  const envelope = buildProjectEventEnvelope({
    event: eventType,
    projectId,
    taskId,
    payload: { ...payload } as Record<string, unknown>,
  });
  deliverProjectPushNotifications([config], envelope).catch((err) => {
    console.error(`A2A push delivery failed for task ${taskId}:`, err);
  });
}
