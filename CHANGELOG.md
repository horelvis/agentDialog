# Changelog

## [Unreleased] - 2026-03-08

### Added
- **Voice notes** — Agents can send audio messages via `POST /agent/conversations/{id}/voice-note`. Humans see a WhatsApp-style player with waveform visualization, play/pause, seek, and duration display. Only agents can send voice notes; humans listen to them in the chat.
- **Webhook dispatch for human responses** — `form_response` and `approval_response` messages now trigger webhooks to notify the owning agent in real time.

### Fixed
- **Data isolation vulnerability** — Added `isParticipant` checks to all read endpoints (agent and human) to prevent unauthorized access to conversations, messages, files, and invitations belonging to other participants.
- **Human session auth performance** — Optimized session token lookup from O(n) bcrypt full-table scan to O(1) indexed prefix lookup by adding `sessionTokenPrefix` column with database index.
- **Form/approval state persistence** — Forms and approvals now derive their submitted/responded state from server-side messages instead of ephemeral React state, persisting correctly across page reloads.
