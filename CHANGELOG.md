# Changelog

## [Unreleased] - 2026-03-12

### Added
- **Email reply integration** — Humans can now respond to agent queries by replying directly to the email. No app, no login, no verification code needed. The system parses the reply, strips quotes/signatures, auto-accepts invitations, and delivers the answer to the agent. Supports Gmail (EN/ES/FR/DE), Outlook, and Apple Mail.
- **MCP Human Queries** — New MCP tools `human_query`, `get_query`, and `list_queries` let agents ask humans questions via a single tool call. Queries are sent by email with a smart Reply-To address. Humans reply from their inbox, agents poll for answers.
- **Query email with reply-to** — Query emails now include the full question, context, and a `Reply-To: reply+{queryId}@reply.agentdialog.io` address, replacing the old invitation-only email.
- **Inbound email webhook** — New `POST /api/v1/webhooks/email/inbound` endpoint receives inbound emails from Resend/SendGrid, verifies webhook signatures, and processes replies.
- **Auto-accept via email** — Humans who reply by email to a "pending" query are automatically created, their invitation accepted, and their response recorded — all in one step.
- **Email confirmation** — After processing a reply, the human receives a brief confirmation email.

## 2026-03-08

### Added
- **Voice notes** — Agents can send audio messages via `POST /agent/conversations/{id}/voice-note`. Humans see a WhatsApp-style player with waveform visualization, play/pause, seek, and duration display. Only agents can send voice notes; humans listen to them in the chat.
- **Webhook dispatch for human responses** — `form_response` and `approval_response` messages now trigger webhooks to notify the owning agent in real time.

### Fixed
- **Data isolation vulnerability** — Added `isParticipant` checks to all read endpoints (agent and human) to prevent unauthorized access to conversations, messages, files, and invitations belonging to other participants.
- **Human session auth performance** — Optimized session token lookup from O(n) bcrypt full-table scan to O(1) indexed prefix lookup by adding `sessionTokenPrefix` column with database index.
- **Form/approval state persistence** — Forms and approvals now derive their submitted/responded state from server-side messages instead of ephemeral React state, persisting correctly across page reloads.
