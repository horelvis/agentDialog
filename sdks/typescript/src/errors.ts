export class AgentDialogError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AgentDialogError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class AuthenticationError extends AgentDialogError {
  constructor(message = "Invalid or missing API key") {
    super(401, "UNAUTHORIZED", message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AgentDialogError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AgentDialogError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AgentDialogError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(422, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

/**
 * A query (or a clarification of one) that the admission gate refused
 * because a human could not actually decide it — not "this payload is
 * malformed" but "this payload is valid and still not answerable". Also
 * `422`, but kept distinct from `ValidationError` because the receiver is an
 * agent, not a person reading documentation: it can only correct itself and
 * retry if the error says what is missing, so `reason` and `remedy` are part
 * of the contract rather than something to dig out of `.message`.
 */
export class UndecidableQueryError extends AgentDialogError {
  /** Machine-readable cause, e.g. "missing_referent" or "prior_decision_without_delta". */
  public readonly reason: string;
  /** What to add or change before retrying. */
  public readonly remedy: string;
  /** Set only for "this human already decided about this subject" refusals. */
  public readonly priorQueryId?: string;

  constructor(message: string, reason: string, remedy: string, priorQueryId?: string) {
    super(422, "UNDECIDABLE_QUERY", message);
    this.name = "UndecidableQueryError";
    this.reason = reason;
    this.remedy = remedy;
    this.priorQueryId = priorQueryId;
  }
}

export class RateLimitError extends AgentDialogError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(429, "RATE_LIMITED", message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends AgentDialogError {
  constructor(message = "Internal server error") {
    super(500, "SERVER_ERROR", message);
    this.name = "ServerError";
  }
}

export class QueryTimeoutError extends AgentDialogError {
  constructor(queryId: string, timeoutMs: number) {
    super(
      408,
      "QUERY_TIMEOUT",
      `Query ${queryId} was not answered within ${timeoutMs}ms`,
    );
    this.name = "QueryTimeoutError";
  }
}
