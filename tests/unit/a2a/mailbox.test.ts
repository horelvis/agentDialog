import { describe, expect, it } from "bun:test";
import {
  buildArtifactResponse,
  buildMessageResponse,
  buildTaskResponse,
} from "@/services/a2a-mailbox.service";
import type { Task } from "@/lib/a2a";

describe("buildMessageResponse", () => {
  it("maps a stored message to the A2A wire shape", () => {
    const row = {
      id: "msg-1",
      taskId: "task-1",
      role: "user" as const,
      parts: [{ kind: "text", text: "do this" }],
      metadata: { lang: "en" },
      createdAt: new Date("2026-09-11T10:00:00Z"),
    };

    const message = buildMessageResponse(row);
    expect(message.messageId).toBe("msg-1");
    expect(message.role).toBe("user");
    expect(message.parts).toEqual(row.parts);
    expect(message.metadata).toEqual({ lang: "en" });
  });

  it("defaults metadata to undefined", () => {
    const row = {
      id: "msg-1",
      taskId: "task-1",
      role: "agent" as const,
      parts: [{ kind: "text", text: "done" }],
      metadata: null,
      createdAt: new Date("2026-09-11T10:00:00Z"),
    };

    const message = buildMessageResponse(row);
    expect(message.role).toBe("agent");
    expect(message.metadata).toBeUndefined();
  });
});

describe("buildArtifactResponse", () => {
  it("maps a stored artifact, including append and lastChunk booleans", () => {
    const row = {
      id: "art-1",
      taskId: "task-1",
      name: "openapi.json",
      description: "Contract",
      parts: [{ kind: "data", data: { path: "/auth" } }],
      index: 0,
      append: 1,
      lastChunk: 1,
      createdAt: new Date("2026-09-11T10:00:00Z"),
    };

    const artifact = buildArtifactResponse(row);
    expect(artifact.artifactId).toBe("art-1");
    expect(artifact.name).toBe("openapi.json");
    expect(artifact.append).toBe(true);
    expect(artifact.lastChunk).toBe(true);
  });

  it("treats lastChunk 0 as false and null as undefined", () => {
    const row = {
      id: "art-2",
      taskId: "task-1",
      name: null,
      description: null,
      parts: [{ kind: "text", text: "chunk" }],
      index: 1,
      append: 0,
      lastChunk: null,
      createdAt: new Date("2026-09-11T10:00:00Z"),
    };

    const artifact = buildArtifactResponse(row);
    expect(artifact.append).toBe(false);
    expect(artifact.lastChunk).toBeUndefined();
  });
});

describe("buildTaskResponse", () => {
  it("builds a complete task with messages and artifacts", () => {
    const task = {
      id: "task-1",
      recipientAgentId: "agent-a",
      senderAgentId: "agent-b",
      contextId: "ctx-1",
      sessionId: null,
      state: "working" as const,
      statusMessage: null,
      metadata: { project: "login" },
      createdAt: new Date("2026-09-11T10:00:00Z"),
      updatedAt: new Date("2026-09-11T10:00:00Z"),
    };

    const messages = [{
      id: "msg-1",
      taskId: "task-1",
      role: "user" as const,
      parts: [{ kind: "text", text: "implement login" }],
      metadata: null,
      createdAt: new Date("2026-09-11T10:00:00Z"),
    }];

    const artifacts = [{
      id: "art-1",
      taskId: "task-1",
      name: null,
      description: null,
      parts: [{ kind: "text", text: "contract" }],
      index: 0,
      append: 0,
      lastChunk: null,
      createdAt: new Date("2026-09-11T10:00:00Z"),
    }];

    const response = buildTaskResponse(task, messages, artifacts) as Task;
    expect(response.id).toBe("task-1");
    expect(response.contextId).toBe("ctx-1");
    expect(response.status.state).toBe("TASK_STATE_WORKING");
    expect(response.messages).toHaveLength(1);
    expect(response.artifacts).toHaveLength(1);
    expect(response.metadata).toEqual({ project: "login" });
  });

  it("omits contextId and sessionId when null", () => {
    const task = {
      id: "task-2",
      recipientAgentId: "agent-a",
      senderAgentId: "agent-b",
      contextId: null,
      sessionId: null,
      state: "submitted" as const,
      statusMessage: null,
      metadata: null,
      createdAt: new Date("2026-09-11T10:00:00Z"),
      updatedAt: new Date("2026-09-11T10:00:00Z"),
    };

    const response = buildTaskResponse(task) as Task;
    expect(response.contextId).toBeUndefined();
    expect(response.sessionId).toBeUndefined();
    expect(response.metadata).toBeUndefined();
  });

  it("includes status message when present", () => {
    const task = {
      id: "task-3",
      recipientAgentId: "agent-a",
      senderAgentId: "agent-b",
      contextId: null,
      sessionId: null,
      state: "input_required" as const,
      statusMessage: { role: "agent", parts: [{ kind: "text", text: "need email" }] } as unknown as Record<string, unknown>,
      metadata: null,
      createdAt: new Date("2026-09-11T10:00:00Z"),
      updatedAt: new Date("2026-09-11T10:00:00Z"),
    };

    const response = buildTaskResponse(task) as Task;
    expect(response.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
    expect(response.status.message?.role).toBe("agent");
  });
});
