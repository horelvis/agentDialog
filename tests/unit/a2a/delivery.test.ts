import { describe, expect, it } from "bun:test";
import type Redis from "ioredis";
import {
  A2A_ARTIFACT_EVENT,
  A2A_MESSAGE_EVENT,
  A2A_STATUS_EVENT,
  buildArtifactUpdatePayload,
  buildEventEnvelope,
  buildMessageUpdatePayload,
  buildStatusUpdatePayload,
  deliverPushNotifications,
  publishTaskEvent,
  taskEventChannel,
} from "@/services/a2a-delivery.service";

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
    const envelope = buildEventEnvelope(A2A_STATUS_EVENT, payload);
    expect(envelope.event).toBe(A2A_STATUS_EVENT);
    expect((envelope.payload as Record<string, unknown>).status).toEqual({ state: "TASK_STATE_WORKING" });
  });

  it("wraps a message update with its event type", () => {
    const message = { role: "agent" as const, parts: [{ kind: "text" as const, text: "On it" }] };
    const payload = buildMessageUpdatePayload(message);
    const envelope = buildEventEnvelope(A2A_MESSAGE_EVENT, payload);
    expect(envelope.event).toBe(A2A_MESSAGE_EVENT);
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

describe("deliverPushNotifications", () => {
  it("delivers to every config and collects results", async () => {
    const calls: Array<{ url: string; options: RequestInit }> = [];
    const fetchImpl = (url: string, options: RequestInit) => {
      calls.push({ url, options });
      const ok = url === "https://public.example.com/hook";
      return Promise.resolve({ ok, status: ok ? 200 : 500 } as Response);
    };

    const payload = buildEventEnvelope(A2A_STATUS_EVENT, buildStatusUpdatePayload({ state: "TASK_STATE_WORKING" }));
    const results = await deliverPushNotifications(
      [
        { url: "https://public.example.com/hook", authInfo: { type: "bearer", token: "secret-1" } },
        { url: "https://fail.example.com/hook" },
      ],
      payload,
      fetchImpl as typeof fetch,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].options.headers).toMatchObject({
      Authorization: "Bearer secret-1",
      "Content-Type": "application/json",
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ url: "https://public.example.com/hook", success: true, statusCode: 200 });
    expect(results[1]).toEqual({ url: "https://fail.example.com/hook", success: false, statusCode: 500 });
  });

  it("reports network errors without throwing", async () => {
    const fetchImpl = () => Promise.reject(new Error("network down"));
    const results = await deliverPushNotifications(
      [{ url: "https://offline.example.com/hook" }],
      {},
      fetchImpl as typeof fetch,
    );

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("network down");
  });
});
