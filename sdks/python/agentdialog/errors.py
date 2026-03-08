from __future__ import annotations


class AgentDialogError(Exception):
    """Base error for all AgentDialog API errors."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details


class AuthenticationError(AgentDialogError):
    """401 — Invalid or missing API key."""

    def __init__(self, message: str = "Invalid or missing API key") -> None:
        super().__init__(401, "UNAUTHORIZED", message)


class ForbiddenError(AgentDialogError):
    """403 — Not authorized for this resource."""

    def __init__(self, message: str = "Forbidden") -> None:
        super().__init__(403, "FORBIDDEN", message)


class NotFoundError(AgentDialogError):
    """404 — Resource not found."""

    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(404, "NOT_FOUND", message)


class ValidationError(AgentDialogError):
    """422 — Invalid input."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(422, "VALIDATION_ERROR", message, details)


class RateLimitError(AgentDialogError):
    """429 — Rate limited."""

    def __init__(self, message: str, retry_after: float = 1.0) -> None:
        super().__init__(429, "RATE_LIMITED", message)
        self.retry_after = retry_after


class ServerError(AgentDialogError):
    """500 — Internal server error."""

    def __init__(self, message: str = "Internal server error") -> None:
        super().__init__(500, "SERVER_ERROR", message)
