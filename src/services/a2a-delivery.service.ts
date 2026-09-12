import type Redis from "ioredis";
import {
  type Task,
  type TaskArtifactUpdateEvent,
  type TaskStatus,
  type TaskStatusUpdateEvent,
  type Artifact,
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
 * Build the envelope used for both SSE and push notifications.
 */
export function buildEventEnvelope(
  eventType: typeof A2A_STATUS_EVENT | typeof A2A_ARTIFACT_EVENT,
  payload: TaskStatusUpdateEvent | TaskArtifactUpdateEvent,
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
  eventType: typeof A2A_STATUS_EVENT | typeof A2A_ARTIFACT_EVENT,
  payload: TaskStatusUpdateEvent | TaskArtifactUpdateEvent,
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

/**
 * Deliver an A2A push notification to every configured webhook. Each delivery
 * is independent: one failing URL must not abort the others.
 */
export async function deliverPushNotifications(
  configs: PushConfig[],
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult[]> {
  const body = JSON.stringify(payload);

  const results = await Promise.all(
    configs.map(async (config): Promise<DeliveryResult> => {
      try {
        const response = await fetchImpl(config.url, {
          method: "POST",
          headers: pushHeaders(config.authInfo),
          body,
          redirect: "manual",
        });

        return {
          url: config.url,
          success: response.ok,
          statusCode: response.status,
        };
      } catch (err) {
        return {
          url: config.url,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
  );

  return results;
}
