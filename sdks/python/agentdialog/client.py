from __future__ import annotations

import time
from typing import Any, Iterator

import httpx

from .errors import (
    AgentDialogError,
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    ServerError,
    ValidationError,
)
from .types import (
    Agent,
    Conversation,
    Invitation,
    Message,
    Pagination,
    PaginatedResponse,
    RegisteredAgent,
    RotateKeyResponse,
    Webhook,
    WebhookWithSecret,
)

DEFAULT_BASE_URL = "https://api.agentdialog.io"
MAX_RETRIES = 3


def _to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    result: list[str] = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            result.append("_")
        result.append(ch.lower())
    return "".join(result)


def _snake_keys(data: Any) -> Any:
    """Recursively convert dict keys from camelCase to snake_case."""
    if isinstance(data, dict):
        return {_to_snake(k): _snake_keys(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_snake_keys(item) for item in data]
    return data


def _to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _camel_keys(data: dict) -> dict:
    """Convert dict keys from snake_case to camelCase."""
    return {_to_camel(k): v for k, v in data.items() if v is not None}


def _parse_agent(data: dict) -> Agent:
    d = _snake_keys(data)
    return Agent(**{k: v for k, v in d.items() if k in Agent.__dataclass_fields__})


def _parse_registered_agent(data: dict) -> RegisteredAgent:
    d = _snake_keys(data)
    return RegisteredAgent(**{k: v for k, v in d.items() if k in RegisteredAgent.__dataclass_fields__})


def _parse_conversation(data: dict) -> Conversation:
    d = _snake_keys(data)
    if d.get("last_message") and isinstance(d["last_message"], dict):
        d["last_message"] = _parse_message(d["last_message"])
    if d.get("participants") and isinstance(d["participants"], list):
        from .types import Participant
        d["participants"] = [
            Participant(**{k: v for k, v in _snake_keys(p).items() if k in Participant.__dataclass_fields__})
            for p in d["participants"]
        ]
    return Conversation(**{k: v for k, v in d.items() if k in Conversation.__dataclass_fields__})


def _parse_message(data: dict) -> Message:
    d = _snake_keys(data)
    if d.get("attachments") and isinstance(d["attachments"], list):
        from .types import FileAttachment
        d["attachments"] = [
            FileAttachment(**{k: v for k, v in _snake_keys(a).items() if k in FileAttachment.__dataclass_fields__})
            for a in d["attachments"]
        ]
    return Message(**{k: v for k, v in d.items() if k in Message.__dataclass_fields__})


def _parse_invitation(data: dict) -> Invitation:
    d = _snake_keys(data)
    return Invitation(**{k: v for k, v in d.items() if k in Invitation.__dataclass_fields__})


def _parse_webhook(data: dict) -> Webhook:
    d = _snake_keys(data)
    return Webhook(**{k: v for k, v in d.items() if k in Webhook.__dataclass_fields__})


def _parse_webhook_with_secret(data: dict) -> WebhookWithSecret:
    d = _snake_keys(data)
    return WebhookWithSecret(**{k: v for k, v in d.items() if k in WebhookWithSecret.__dataclass_fields__})


def _error_from_response(status: int, body: dict) -> AgentDialogError:
    err = body.get("error", {})
    message = err.get("message", "Unknown error")
    details = err.get("details")

    if status == 401:
        return AuthenticationError(message)
    if status == 403:
        return ForbiddenError(message)
    if status == 404:
        return NotFoundError(message)
    if status == 422:
        return ValidationError(message, details)
    if status == 429:
        return RateLimitError(message, err.get("retryAfter", 1))
    if status >= 500:
        return ServerError(message)
    return AgentDialogError(status, err.get("code", "UNKNOWN"), message, details)


class AgentDialog:
    """Official Python client for the AgentDialog API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=f"{self._base_url}/api/v1",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
        )

    # ── Static: Register ──

    @staticmethod
    def register(
        *,
        slug: str,
        display_name: str,
        description: str | None = None,
        avatar_url: str | None = None,
        homepage_url: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        capabilities: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        agent_card: dict[str, Any] | None = None,
        base_url: str = DEFAULT_BASE_URL,
    ) -> AgentDialog:
        """Register a new agent. Returns a client instance.

        The registered agent data is available as `client.agent`.
        """
        body = _camel_keys({
            "slug": slug,
            "display_name": display_name,
            "description": description,
            "avatar_url": avatar_url,
            "homepage_url": homepage_url,
            "provider": provider,
            "model": model,
            "capabilities": capabilities,
            "metadata": metadata,
            "agent_card": agent_card,
        })

        resp = httpx.post(
            f"{base_url.rstrip('/')}/api/v1/agent/register",
            json=body,
            timeout=30.0,
        )
        if resp.status_code >= 400:
            raise _error_from_response(resp.status_code, resp.json())

        data = resp.json()["data"]
        agent = _parse_registered_agent(data)
        client = AgentDialog(api_key=agent.api_key, base_url=base_url)
        client.agent = agent  # type: ignore[attr-defined]
        return client

    # ── Profile ──

    def get_profile(self) -> Agent:
        return _parse_agent(self._request("GET", "/agent/me"))

    def update_profile(self, **kwargs: Any) -> Agent:
        body = _camel_keys(kwargs)
        return _parse_agent(self._request("PATCH", "/agent/me", json=body))

    # ── API Key ──

    def rotate_api_key(self) -> RotateKeyResponse:
        d = _snake_keys(self._request("POST", "/agent/key/rotate"))
        return RotateKeyResponse(**{k: v for k, v in d.items() if k in RotateKeyResponse.__dataclass_fields__})

    # ── Conversations ──

    def list_conversations(
        self,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PaginatedResponse:
        params: dict[str, Any] = {}
        if cursor is not None:
            params["cursor"] = cursor
        if limit is not None:
            params["limit"] = limit

        raw = self._request_raw("GET", "/agent/conversations", params=params)
        conversations = [_parse_conversation(c) for c in raw["data"]]
        pag = _snake_keys(raw.get("pagination", {}))
        return PaginatedResponse(
            data=conversations,
            pagination=Pagination(**{k: v for k, v in pag.items() if k in Pagination.__dataclass_fields__}),
        )

    def list_all_conversations(self, *, limit: int | None = None) -> Iterator[Conversation]:
        cursor: str | None = None
        while True:
            page = self.list_conversations(cursor=cursor, limit=limit)
            yield from page.data
            if not page.pagination.has_more:
                break
            cursor = page.pagination.next_cursor

    def create_conversation(self, **kwargs: Any) -> Conversation:
        body = _camel_keys(kwargs)
        return _parse_conversation(self._request("POST", "/agent/conversations", json=body))

    def get_conversation(self, conversation_id: str) -> Conversation:
        return _parse_conversation(self._request("GET", f"/agent/conversations/{conversation_id}"))

    def update_conversation(self, conversation_id: str, **kwargs: Any) -> Conversation:
        body = _camel_keys(kwargs)
        return _parse_conversation(self._request("PATCH", f"/agent/conversations/{conversation_id}", json=body))

    # ── Messages ──

    def send_message(self, conversation_id: str, **kwargs: Any) -> Message:
        body = _camel_keys(kwargs)
        return _parse_message(
            self._request("POST", f"/agent/conversations/{conversation_id}/messages", json=body)
        )

    def list_messages(
        self,
        conversation_id: str,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PaginatedResponse:
        params: dict[str, Any] = {}
        if cursor is not None:
            params["cursor"] = cursor
        if limit is not None:
            params["limit"] = limit

        raw = self._request_raw("GET", f"/agent/conversations/{conversation_id}/messages", params=params)
        messages = [_parse_message(m) for m in raw["data"]]
        pag = _snake_keys(raw.get("pagination", {}))
        return PaginatedResponse(
            data=messages,
            pagination=Pagination(**{k: v for k, v in pag.items() if k in Pagination.__dataclass_fields__}),
        )

    def list_all_messages(self, conversation_id: str, *, limit: int | None = None) -> Iterator[Message]:
        cursor: str | None = None
        while True:
            page = self.list_messages(conversation_id, cursor=cursor, limit=limit)
            yield from page.data
            if not page.pagination.has_more:
                break
            cursor = page.pagination.next_cursor

    # ── Invitations ──

    def invite_human(self, conversation_id: str, **kwargs: Any) -> Invitation:
        body = _camel_keys(kwargs)
        return _parse_invitation(
            self._request("POST", f"/agent/conversations/{conversation_id}/invitations", json=body)
        )

    def list_invitations(self, conversation_id: str) -> list[Invitation]:
        data = self._request("GET", f"/agent/conversations/{conversation_id}/invitations")
        if isinstance(data, list):
            return [_parse_invitation(i) for i in data]
        return [_parse_invitation(data)]

    def revoke_invitation(self, invitation_id: str) -> Invitation:
        return _parse_invitation(
            self._request("DELETE", f"/agent/conversations/invitations/{invitation_id}")
        )

    # ── Webhooks ──

    def create_webhook(self, **kwargs: Any) -> WebhookWithSecret:
        body = _camel_keys(kwargs)
        return _parse_webhook_with_secret(self._request("POST", "/agent/webhooks", json=body))

    def list_webhooks(self) -> list[Webhook]:
        data = self._request("GET", "/agent/webhooks")
        if isinstance(data, list):
            return [_parse_webhook(w) for w in data]
        return [_parse_webhook(data)]

    def update_webhook(self, webhook_id: str, **kwargs: Any) -> Webhook:
        body = _camel_keys(kwargs)
        return _parse_webhook(self._request("PATCH", f"/agent/webhooks/{webhook_id}", json=body))

    def delete_webhook(self, webhook_id: str) -> Webhook:
        return _parse_webhook(self._request("DELETE", f"/agent/webhooks/{webhook_id}"))

    # ── Internal ──

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        _retries: int = 0,
    ) -> Any:
        raw = self._request_raw(method, path, json=json, params=params, _retries=_retries)
        return raw.get("data", raw)

    def _request_raw(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        _retries: int = 0,
    ) -> dict:
        resp = self._client.request(method, path, json=json, params=params)

        if resp.status_code == 429 and _retries < MAX_RETRIES:
            retry_after = float(resp.headers.get("retry-after", "1"))
            time.sleep(retry_after)
            return self._request_raw(method, path, json=json, params=params, _retries=_retries + 1)

        body = resp.json()
        if resp.status_code >= 400:
            raise _error_from_response(resp.status_code, body)

        return body

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> AgentDialog:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
