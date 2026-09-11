import { describe, expect, it } from "bun:test";
import {
  agentCardSchema,
  messageSchema,
  partSchema,
  sendMessageRequestSchema,
  taskSchema,
  taskStatusSchema,
} from "@/lib/a2a/types";

describe("partSchema", () => {
  it("accepts a text part", () => {
    expect(partSchema.safeParse({ kind: "text", text: "hello" }).success).toBe(true);
  });

  it("accepts a data part", () => {
    expect(
      partSchema.safeParse({ kind: "data", data: { invoiceId: "123" } }).success,
    ).toBe(true);
  });

  it("accepts a file part with a URI", () => {
    expect(
      partSchema.safeParse({
        kind: "file",
        file: { uri: "https://example.com/file.pdf", mimeType: "application/pdf" },
      }).success,
    ).toBe(true);
  });

  it("rejects a part without a known kind", () => {
    expect(partSchema.safeParse({ kind: "image", url: "x" }).success).toBe(false);
  });
});

describe("messageSchema", () => {
  it("requires at least one part", () => {
    expect(messageSchema.safeParse({ role: "user", parts: [] }).success).toBe(false);
  });

  it("accepts a message with role and parts", () => {
    expect(
      messageSchema.safeParse({
        role: "user",
        parts: [{ kind: "text", text: "check this" }],
      }).success,
    ).toBe(true);
  });
});

describe("taskStatusSchema", () => {
  it("accepts a valid terminal status", () => {
    expect(
      taskStatusSchema.safeParse({
        state: "TASK_STATE_COMPLETED",
        timestamp: "2026-09-11T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown state", () => {
    expect(
      taskStatusSchema.safeParse({ state: "TASK_STATE_UNKNOWN" }).success,
    ).toBe(false);
  });
});

describe("taskSchema", () => {
  it("accepts a complete task", () => {
    const task = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: { state: "TASK_STATE_SUBMITTED" },
      contextId: "ctx-1",
      metadata: { source: "test" },
    };
    expect(taskSchema.safeParse(task).success).toBe(true);
  });

  it("rejects a task with invalid id", () => {
    expect(
      taskSchema.safeParse({ id: "not-a-uuid", status: { state: "TASK_STATE_SUBMITTED" } }).success,
    ).toBe(false);
  });
});

describe("agentCardSchema", () => {
  it("requires supported interfaces", () => {
    expect(agentCardSchema.safeParse({ name: "x", version: "1.0" }).success).toBe(false);
  });

  it("accepts a minimal valid card", () => {
    expect(
      agentCardSchema.safeParse({
        name: "Invoice Checker",
        version: "1.0",
        supportedInterfaces: [
          { protocolBinding: "HTTP+JSON", url: "https://example.com/a2a", protocolVersion: "1.0" },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("sendMessageRequestSchema", () => {
  it("requires a message", () => {
    const request = {
      message: {
        role: "user",
        parts: [{ kind: "text", text: "do this" }],
      },
      contextId: "ctx-1",
    };
    expect(sendMessageRequestSchema.safeParse(request).success).toBe(true);
  });
});
