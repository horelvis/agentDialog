export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, id ? `${resource} '${id}' not found` : `${resource} not found`, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(422, message, "VALIDATION_ERROR");
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super(429, "Rate limit exceeded", "RATE_LIMIT");
    if (retryAfterSeconds) {
      (this as any).retryAfter = retryAfterSeconds;
    }
  }
}

/**
 * Two different conflicts share 409 and are told apart by `code`, which is what
 * an agent can branch on without reading prose.
 */
export class IdempotencyConflictError extends AppError {
  constructor(message: string, code: "IDEMPOTENCY_IN_PROGRESS" | "IDEMPOTENCY_KEY_REUSED") {
    super(409, message, code);
  }
}

/**
 * The receiver of this error is an agent, not a person reading documentation.
 * It can only correct itself and retry if the error says what is missing, so
 * `remedy` is part of the contract rather than a courtesy.
 */
export class UndecidableQueryError extends AppError {
  constructor(
    public reason: string,
    public detail: string,
    public remedy: string,
    public priorQueryId?: string,
  ) {
    super(422, detail, "UNDECIDABLE_QUERY");
    this.name = "UndecidableQueryError";
  }
}
