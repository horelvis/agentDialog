from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


ActorType = Literal["agent", "human"]
ConversationStatus = Literal["active", "archived", "closed"]
IntentType = Literal["permission", "clarification", "solicitation", "notification"]
InvitationStatus = Literal["pending", "accepted", "declined", "expired", "revoked"]
MessageType = Literal[
    "text", "structured", "file", "tool_call", "tool_result",
    "form", "form_response", "approval", "approval_response",
    "notification", "system",
]
RiskLevel = Literal["low", "medium", "high", "critical"]
Severity = Literal["info", "warning", "error", "success"]
ToolCallStatus = Literal["pending", "running", "completed", "failed"]


@dataclass
class Agent:
    id: str
    slug: str
    display_name: str
    capabilities: list[str]
    status: str
    created_at: str
    description: str | None = None
    avatar_url: str | None = None
    homepage_url: str | None = None
    provider: str | None = None
    model: str | None = None
    api_key_prefix: str | None = None
    rate_limit_rpm: int | None = None
    metadata: dict[str, Any] | None = None
    agent_card: dict[str, Any] | None = None
    trust_score: float | None = None
    total_ratings: int | None = None
    updated_at: str | None = None


@dataclass
class RegisteredAgent(Agent):
    api_key: str = ""


@dataclass
class Participant:
    actor_type: ActorType
    display_name: str
    role: Literal["owner", "participant"]
    joined_at: str
    agent_id: str | None = None
    human_id: str | None = None
    last_read_at: str | None = None


@dataclass
class FileAttachment:
    id: str
    file_name: str
    mime_type: str
    size_bytes: int
    url: str | None = None


@dataclass
class Message:
    id: str
    conversation_id: str
    sender_type: ActorType
    type: MessageType
    created_at: str
    updated_at: str
    content: str | None = None
    sender_agent_id: str | None = None
    sender_human_id: str | None = None
    structured_data: dict[str, Any] | None = None
    reply_to_id: str | None = None
    tool_call_id: str | None = None
    metadata: dict[str, Any] | None = None
    attachments: list[FileAttachment] | None = None


@dataclass
class Conversation:
    id: str
    status: ConversationStatus
    created_by_agent_id: str
    created_at: str
    updated_at: str
    title: str | None = None
    description: str | None = None
    intent_type: IntentType | None = None
    context: dict[str, Any] | None = None
    participants: list[Participant] | None = None
    last_message: Message | None = None
    settings: dict[str, Any] | None = None


@dataclass
class Invitation:
    id: str
    conversation_id: str
    token: str
    invited_by_agent_id: str
    invited_human_email: str
    status: InvitationStatus
    expires_at: str
    created_at: str
    message: str | None = None
    agent_display_name: str | None = None
    conversation_title: str | None = None


@dataclass
class Webhook:
    id: str
    agent_id: str
    url: str
    events: list[str]
    is_active: bool
    created_at: str
    updated_at: str


@dataclass
class WebhookWithSecret(Webhook):
    secret: str = ""


@dataclass
class Pagination:
    has_more: bool
    count: int
    next_cursor: str | None = None


@dataclass
class PaginatedResponse:
    data: list[Any]
    pagination: Pagination


@dataclass
class RotateKeyResponse:
    api_key: str
    api_key_prefix: str
    message: str
