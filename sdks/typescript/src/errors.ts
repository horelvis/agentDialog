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
