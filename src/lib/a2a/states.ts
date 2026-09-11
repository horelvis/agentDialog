import {
  internalTaskStateSchema,
  taskStateSchema,
  type InternalTaskState,
  type TaskState,
} from "./types";

/**
 * A2A task states are exposed as UPPER_SNAKE constants. Internally we keep a
 * small, lowercase enum that is easier to persist and query. Both directions
 * are pure maps so there is no ambiguity at the boundary.
 */

const a2aToInternal: Record<TaskState, InternalTaskState> = {
  TASK_STATE_SUBMITTED: "submitted",
  TASK_STATE_WORKING: "working",
  TASK_STATE_INPUT_REQUIRED: "input_required",
  TASK_STATE_COMPLETED: "completed",
  TASK_STATE_FAILED: "failed",
  TASK_STATE_CANCELED: "canceled",
  TASK_STATE_REJECTED: "rejected",
};

const internalToA2a: Record<InternalTaskState, TaskState> = {
  submitted: "TASK_STATE_SUBMITTED",
  working: "TASK_STATE_WORKING",
  input_required: "TASK_STATE_INPUT_REQUIRED",
  completed: "TASK_STATE_COMPLETED",
  failed: "TASK_STATE_FAILED",
  canceled: "TASK_STATE_CANCELED",
  rejected: "TASK_STATE_REJECTED",
};

export function a2aStateFromInternal(state: InternalTaskState): TaskState {
  return internalToA2a[state];
}

export function internalStateFromA2a(state: TaskState): InternalTaskState {
  return a2aToInternal[state];
}

export function isTerminalA2AState(state: TaskState): boolean {
  return [
    "TASK_STATE_COMPLETED",
    "TASK_STATE_FAILED",
    "TASK_STATE_CANCELED",
    "TASK_STATE_REJECTED",
  ].includes(state);
}

export function isTerminalInternalState(state: InternalTaskState): boolean {
  return ["completed", "failed", "canceled", "rejected"].includes(state);
}

export function validateTaskState(state: unknown): TaskState {
  return taskStateSchema.parse(state);
}

export function validateInternalTaskState(state: unknown): InternalTaskState {
  return internalTaskStateSchema.parse(state);
}
