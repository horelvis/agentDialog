import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { inspectWebhookTarget } from "../lib/webhook-url-guard";
import {
  type Task,
  type TaskArtifactUpdateEvent,
  type TaskStatus,
  type TaskStatusUpdateEvent,
  type Artifact,
  type Message,
} from "@/lib/a2a";

export interface PushConfig {
  url: string;
  authInfo?: Record<string, unknown>;
}

export interface DeliveryResult {
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export const A2A_STATUS_EVENT = "task_status";
export const A2A_ARTIFACT_EVENT = "task_artifact";
export const A2A_MESSAGE_EVENT = "task_message";
export const A2A_TASK_NEW_EVENT = "task_new";

export interface MessageUpdateEvent {
  message: Message;
  timestamp: string;
}

/**
 * The envelope for a project-level push notification. `eventId` is new per
 * notification and stable for its retries, so a consumer can deduplicate; the
 * SSE payload builders below stay as they are for the sender's stream.
 */
export interface ProjectEventEnvelope {
  event: string;
  eventId: string;
  projectId: string;
  taskId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export function buildProjectEventEnvelope(input: {
  event: string;
  projectId: string;
  taskId: string;
  payload: Record<string, unknown>;
}): ProjectEventEnvelope {
  return {
    event: input.event,
    eventId: randomUUID(),
    projectId: input.projectId,
    taskId: input.taskId,
    payload: input.payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the SSE payload for a task status change. The envelope carries the
 * event type so a single SSE stream can distinguish status and artifact
 * updates.
 */
export function buildStatusUpdatePayload(
  status: TaskStatus,
  options?: { finalChunk?: boolean },
): TaskStatusUpdateEvent {
  return {
    status,
    finalChunk: options?.finalChunk,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the SSE payload for a new artifact.
 */
export function buildArtifactUpdatePayload(
  artifact: Artifact,
  options?: { finalChunk?: boolean },
): TaskArtifactUpdateEvent {
  return {
    artifact,
    finalChunk: options?.finalChunk,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the SSE payload for a new message in the task thread. A2A streams
 * status and artifact events; a message is how the recipient talks back inside
 * a multi-turn collaboration, and the sender must learn it landed even though
 * the spec does not define a message event — this is the hub's extension.
 */
export function buildMessageUpdatePayload(message: Message): MessageUpdateEvent {
  return {
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the envelope used for both SSE and push notifications.
 */
export function buildEventEnvelope(
  eventType: typeof A2A_STATUS_EVENT | typeof A2A_ARTIFACT_EVENT | typeof A2A_MESSAGE_EVENT,
  payload: TaskStatusUpdateEvent | TaskArtifactUpdateEvent | MessageUpdateEvent,
): Record<string, unknown> {
  return { event: eventType, payload };
}

export function taskEventChannel(taskId: string): string {
  return `a2a:task:${taskId}`;
}

/**
 * Publish an A2A event to Redis so SSE streams can fan it out.
 */
export async function publishTaskEvent(
  redis: Redis,
  taskId: string,
  eventType: typeof A2A_STATUS_EVENT | typeof A2A_ARTIFACT_EVENT | typeof A2A_MESSAGE_EVENT,
  payload: TaskStatusUpdateEvent | TaskArtifactUpdateEvent | MessageUpdateEvent,
): Promise<void> {
  const envelope = buildEventEnvelope(eventType, payload);
  await redis.publish(taskEventChannel(taskId), JSON.stringify(envelope));
}

function pushHeaders(authInfo?: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AgentDialog-A2A/1.0",
  };

  if (!authInfo) return headers;

  const type = authInfo.type;
  if (type === "bearer" && typeof authInfo.token === "string") {
    headers["Authorization"] = `Bearer ${authInfo.token}`;
  }

  return headers;
}

export interface DeliveryOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Delay before each retry, in order; the last value is reused. */
  retryDelaysMs?: number[];
  maxAttempts?: number;
}

/**
 * Deliver one envelope to one callback. Checked at delivery as well as at
 * registration, because this is the call that carries the security: a URL
 * stored before the guard existed, or one whose hostname was repointed at a
 * private address, only ever meets the guard on its way out.
 */
export async function deliverProjectPush(
  config: PushConfig,
  envelope: ProjectEventEnvelope,
  options: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const verdict = await inspectWebhookTarget(config.url);
  if (!verdict.allowed) {
    return { url: config.url, success: false, error: verdict.reason };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: pushHeaders(config.authInfo),
      body: JSON.stringify(envelope),
      redirect: "manual",
      signal: controller.signal,
    });

    return { url: config.url, success: response.ok, statusCode: response.status };
  } catch (error) {
    return {
      url: config.url,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deliver an envelope to every configured callback, retrying each one with
 * backoff. The `eventId` is stable across a delivery's retries, so a consumer
 * that saw the event once can drop the repeats. One failing URL never aborts
 * the others.
 */
export async function deliverProjectPushNotifications(
  configs: PushConfig[],
  envelope: ProjectEventEnvelope,
  options: DeliveryOptions = {},
): Promise<DeliveryResult[]> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delays = options.retryDelaysMs ?? [1000, 5000];

  return Promise.all(
    configs.map(async (config): Promise<DeliveryResult> => {
      let last: DeliveryResult | null = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        last = await deliverProjectPush(config, envelope, options);
        if (last.success) return last;

        if (attempt < maxAttempts - 1) {
          const delay = delays[attempt] ?? delays[delays.length - 1] ?? 1000;
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      return last!;
    }),
  );
}