import { describe, expect, it } from "bun:test";
import {
  a2aStateFromInternal,
  internalStateFromA2a,
  isTerminalA2AState,
  isTerminalInternalState,
  validateInternalTaskState,
  validateTaskState,
} from "@/lib/a2a/states";

describe("a2a state mapping", () => {
  it("maps every internal state to a task state and back", () => {
    const internalStates = [
      "submitted",
      "working",
      "input_required",
      "completed",
      "failed",
      "canceled",
      "rejected",
    ] as const;

    for (const internal of internalStates) {
      const a2a = a2aStateFromInternal(internal);
      expect(internalStateFromA2a(a2a)).toBe(internal);
    }
  });

  it("maps every a2a state to an internal state and back", () => {
    const a2aStates = [
      "TASK_STATE_SUBMITTED",
      "TASK_STATE_WORKING",
      "TASK_STATE_INPUT_REQUIRED",
      "TASK_STATE_COMPLETED",
      "TASK_STATE_FAILED",
      "TASK_STATE_CANCELED",
      "TASK_STATE_REJECTED",
    ] as const;

    for (const a2a of a2aStates) {
      const internal = internalStateFromA2a(a2a);
      expect(a2aStateFromInternal(internal)).toBe(a2a);
    }
  });

  it("detects terminal states", () => {
    expect(isTerminalA2AState("TASK_STATE_COMPLETED")).toBe(true);
    expect(isTerminalA2AState("TASK_STATE_FAILED")).toBe(true);
    expect(isTerminalA2AState("TASK_STATE_CANCELED")).toBe(true);
    expect(isTerminalA2AState("TASK_STATE_REJECTED")).toBe(true);
    expect(isTerminalA2AState("TASK_STATE_SUBMITTED")).toBe(false);
    expect(isTerminalA2AState("TASK_STATE_WORKING")).toBe(false);
  });

  it("detects terminal internal states", () => {
    expect(isTerminalInternalState("completed")).toBe(true);
    expect(isTerminalInternalState("submitted")).toBe(false);
  });

  it("rejects unknown a2a states", () => {
    expect(() => validateTaskState("TASK_STATE_UNKNOWN")).toThrow();
  });

  it("rejects unknown internal states", () => {
    expect(() => validateInternalTaskState("unknown")).toThrow();
  });
});
