import { describe, expect, it } from "bun:test";
import type Redis from "ioredis";
import {
  A2A_ARTIFACT_EVENT,
  A2A_MESSAGE_EVENT,
  A2A_STATUS_EVENT,
  buildArtifactUpdatePayload,
  buildEventEnvelope,
  buildMessageUpdatePayload,
  buildProjectEventEnvelope,
  buildStatusUpdatePayload,
  deliverProjectPush,
  deliverProjectPushNotifications,
  publishTaskEvent,
  taskEventChannel,
  type ProjectEventEnvelope,
} from "@/services/a2a-delivery.service";

function envelope(): ProjectEventEnvelope {
  return buildProjectEventEnvelope({
    event: A2A_STATUS_EVENT,
    projectId: "project-1",
    taskId: "task-123",
    payload: { status: { state: "TASK_STATE_WORKING" } },
  });
}

describe("buildStatusUpdatePayload", () => {
  it("includes the status and a timestamp", () => {
    const payload = buildStatusUpdatePayload({ state: "TASK_STATE_SUBMITTED" });
    expect(payload.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("carries finalChunk when provided", () => {
    const payload = buildStatusUpdatePayload({ state: "TASK_STATE_COMPLETED" }, { finalChunk: true });
    expect(payload.finalChunk).toBe(true);
  });
});

describe("buildArtifactUpdatePayload", () => {
  it("includes the artifact and a timestamp", () => {
    const artifact = { parts: [{ kind: "text", text: "deliverable" }] };
    const payload = buildArtifactUpdatePayload(artifact);
    expect(payload.artifact.parts).toEqual(artifact.parts);
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("buildEventEnvelope", () => {
  it("wraps payload with event type", () => {
    const payload = buildStatusUpdatePayload({ state: "TASK_STATE_WORKING" });
    const e = buildEventEnvelope(A2A_STATUS_EVENT, payload);
    expect(e.event).toBe(A2A_STATUS_EVENT);
    expect((e.payload as Record<string, unknown>).status).toEqual({ state: "TASK_STATE_WORKING" });
  });

  it("wraps a message update with its event type", () => {
    const message = { role: "agent" as const, parts: [{ kind: "text" as const, text: "On it" }] };
    const payload = buildMessageUpdatePayload(message);
    const e = buildEventEnvelope(A2A_MESSAGE_EVENT, payload);
    expect(e.event).toBe(A2A_MESSAGE_EVENT);
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("buildProjectEventEnvelope", () => {
  it("carries an eventId and the project and task it is about", () => {
    const e = envelope();
    expect(e.eventId).toBeTruthy();
    expect(e.projectId).toBe("project-1");
    expect(e.taskId).toBe("task-123");
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("mints a fresh eventId per envelope", () => {
    expect(envelope().eventId).not.toBe(envelope().eventId);
  });
});

describe("publishTaskEvent", () => {
  it("publishes a JSON envelope to the task channel", async () => {
    const published: Array<{ channel: string; message: string }> = [];
    const redis = { publish: (channel: string, message: string) => {
      published.push({ channel, message });
      return Promise.resolve(1);
    } } as unknown as Redis;

    const payload = buildStatusUpdatePayload({ state: "TASK_STATE_COMPLETED" });
    await publishTaskEvent(redis, "task-123", A2A_STATUS_EVENT, payload);

    expect(published).toHaveLength(1);
    expect(published[0].channel).toBe(taskEventChannel("task-123"));
    const parsed = JSON.parse(published[0].message);
    expect(parsed.event).toBe(A2A_STATUS_EVENT);
    expect(parsed.payload.status.state).toBe("TASK_STATE_COMPLETED");
  });
});

describe("deliverProjectPushNotifications", () => {
  it("delivers to every config, sends bearer auth, and reports results", async () => {
    const calls: Array<{ url: string; options: RequestInit }> = [];
    const fetchImpl = (url: string, options: RequestInit) => {
      calls.push({ url, options });
      const ok = url === "https://public.example.com/hook";
      return Promise.resolve({ ok, status: ok ? 200 : 500 } as Response);
    };

    const results = await deliverProjectPushNotifications(
      [
        { url: "https://public.example.com/hook", authInfo: { type: "bearer", token: "secret-1" } },
        { url: "https://fail.example.com/hook" },
      ],
      envelope(),
      { fetchImpl: fetchImpl as typeof fetch, maxAttempts: 1 },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].options.headers).toMatchObject({
      Authorization: "Bearer secret-1",
      "Content-Type": "application/json",
    });
    // The same envelope is sent to both; the eventId lets the consumer dedupe.
    const bodyA = JSON.parse(calls[0].options.body as string);
    const bodyB = JSON.parse(calls[1].options.body as string);
    expect(bodyA.eventId).toBe(bodyB.eventId);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ url: "https://public.example.com/hook", success: true, statusCode: 200 });
    expect(results[1]).toEqual({ url: "https://fail.example.com/hook", success: false, statusCode: 500 });
  });

  it("retries a failing delivery with the same eventId and gives up after maxAttempts", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string) => {
      calls.push(url);
      return Promise.resolve({ ok: false, status: 503 } as Response);
    };

    const results = await deliverProjectPushNotifications(
      [{ url: "https://public.example.com/hook" }],
      envelope(),
      { fetchImpl: fetchImpl as typeof fetch, maxAttempts: 3, retryDelaysMs: [0, 0] },
    );

    expect(calls).toHaveLength(3);
    expect(results[0].success).toBe(false);
    expect(results[0].statusCode).toBe(503);
  });

  it("stops retrying once a delivery succeeds", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string) => {
      calls.push(url);
      return Promise.resolve({ ok: true, status: 200 } as Response);
    };

    await deliverProjectPushNotifications(
      [{ url: "https://public.example.com/hook" }],
      envelope(),
      { fetchImpl: fetchImpl as typeof fetch, maxAttempts: 3, retryDelaysMs: [0, 0] },
    );

    expect(calls).toHaveLength(1);
  });

  it("reports network errors without throwing", async () => {
    const fetchImpl = () => Promise.reject(new Error("network down"));
    const results = await deliverProjectPushNotifications(
      [{ url: "https://offline.example.com/hook" }],
      envelope(),
      { fetchImpl: fetchImpl as typeof fetch, maxAttempts: 1 },
    );

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("network down");
  });
});

describe("deliverProjectPush", () => {
  it("does not follow a redirect", async () => {
    const fetchImpl = (url: string, options: RequestInit) => {
      expect(options.redirect).toBe("manual");
      return Promise.resolve({ ok: false, status: 302 } as Response);
    };
    const result = await deliverProjectPush(
      { url: "https://public.example.com/hook" },
      envelope(),
      { fetchImpl: fetchImpl as typeof fetch, maxAttempts: 1 },
    );
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(302);
  });
});