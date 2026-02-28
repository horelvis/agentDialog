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
