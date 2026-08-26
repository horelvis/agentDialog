import { createHash } from "node:crypto";
import { ValidationError } from "./errors";

/** Twenty-four hours, which is what the industry does and far longer than any
 *  sane retry window. */
export const IDEMPOTENCY_TTL_SECONDS = 86_400;

/**
 * How long a reservation may sit unfinished. A process that dies between
 * reserving and completing would otherwise lock the key for the full window,
 * and every retry would meet 409 until it expired. Two minutes is far above any
 * request this API serves and far below anything a caller would wait out.
 */
export const IDEMPOTENCY_RESERVATION_TTL_SECONDS = 120;

const MAX_KEY_LENGTH = 255;

export type IdempotencyRecord =
  | { state: "in_progress"; bodyHash: string }
  | { state: "completed"; bodyHash: string; status: number; body: string };

export type IdempotencyDecision =
  | { kind: "proceed" }
  | { kind: "in_progress" }
  | { kind: "reused" }
  | { kind: "replay"; status: number; body: string };

export function assertValidIdempotencyKey(value: string): void {
  if (value.trim().length === 0) {
    throw new ValidationError("Idempotency-Key must not be empty");
  }
  if (value.length > MAX_KEY_LENGTH) {
    throw new ValidationError(
      `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
    );
  }
}

export function hashBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * The scope of a key is the agent, the method and the path. Two agents may pick
 * the same string without seeing each other, and the same agent reusing its key
 * on another route does not collide either.
 */
export function idempotencyStorageKey(
  agentId: string,
  method: string,
  path: string,
  key: string,
): string {
  const digest = createHash("sha256").update(`${method} ${path} ${key}`).digest("hex");
  return `idem:${agentId}:${digest}`;
}

export function decideFromRecord(
  record: IdempotencyRecord | null,
  bodyHash: string,
): IdempotencyDecision {
  if (record === null) return { kind: "proceed" };
  if (record.bodyHash !== bodyHash) return { kind: "reused" };
  if (record.state === "in_progress") return { kind: "in_progress" };
  return { kind: "replay", status: record.status, body: record.body };
}
