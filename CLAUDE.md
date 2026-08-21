# AgentDialog — notes for agents working in this repo

Agent-first messaging: AI agents ask humans questions, humans answer by replying
to an email. Bun + Hono + PostgreSQL/Drizzle + Redis on the backend, React on the
landing page, Fumadocs for the public docs, and a published TypeScript SDK.

## Layout

| Path | What it is | Toolchain |
|---|---|---|
| `src/` | The API, WebSocket server and MCP server | Bun |
| `web/` | Landing page and human chat UI | Bun + Vite |
| `docs-site/` | docs.agentdialog.io | **npm**, not Bun |
| `sdks/typescript/` | `@agentdialog/sdk`, published to npm | Bun |
| `sdks/python/` | Python SDK, **not published** | — |
| `docs/api/README.md` | The API guide, source of truth | — |

`docs-site` uses npm because Next.js and Fumadocs expect it. Do not "fix" this by
switching it to Bun.

## Commands

```bash
bun run dev              # API on :3000, hot reload
bun test                 # everything
bun test tests/unit      # no database needed
bun run db:migrate       # apply migrations
bun run typecheck        # SEE THE TRAP BELOW
```

Setup from scratch:

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
cp .env.example .env
bun install
bun run db:migrate
```

The integration tests need a separate database:

```bash
docker exec <postgres-container> psql -U agentdialog -d agentdialog \
  -c "CREATE DATABASE agentdialog_test"
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun run scripts/migrate.ts
```

## Traps

Every one of these cost real time. They are not hypothetical.

**`bun run typecheck` at the root used to fail regardless of your change** — six
pre-existing errors in `src/mcp/server.ts`. That has been fixed: `bunx tsc
--noEmit` exits 0 as of this branch. If it fails now, the change under test
broke something real — do not wave it off as the old, known failure. The
publish workflow still deliberately typechecks only the SDK.

**Integration tests are not hermetic.** Agent registration is rate-limited to 10
per hour, and the counter lives in Redis, which survives between runs. Run the
suite a few times in a row and you get spurious `429`s that look like real
failures. Clear it with `redis-cli -n 1 FLUSHDB` against the test database.

**Two release paths that must not be confused.** A GitHub Release deploys the API
and **runs migrations against production**. A `sdk-v*` tag publishes the SDK.
`.github/workflows/deploy.yml` carries a guard against `sdk-v*` tags, but never cut a GitHub
Release to publish the SDK. See `docs/operations.md`.

**The SDK's tsconfig must declare its own `lib`.** It once declared only
`ES2022`, and compiled anyway because TypeScript inherits `@types/*` from
ancestor directories — it was borrowing `@types/bun` from this repo's root. It
built for months and could not be built standalone. `sdks/typescript/packaged/`
and `sdks/typescript/scripts/smoke-pack.sh` exist to catch exactly that; do not weaken them.

**zod is deduplicated by `"overrides": {"zod": "$zod"}` in the root
`package.json`.** That syntax forces every dependency onto the zod version this
manifest declares. The MCP SDK
declares `zod: "^3.25 || ^4.0"` and would otherwise nest its own copy, producing
two zod instances across the tool-registration boundary. Do not remove the
override, and do not pin zod below 3.25 — the MCP SDK imports `zod/v3` and
`zod/v4-mini`, which older zod does not export.

**Docker lockfile globs are `bun.lock*`, not `bun.lockb*`.** Bun 1.4 writes a
text lockfile. The old glob matched nothing, so every `--frozen-lockfile`
silently ran with no lockfile at all.

## Conventions

Code, comments and commit messages in English. The repo's own docs and specs are
in Spanish; match whatever file you are editing.

The queries REST resource is **snake_case** on the wire (`query_type`,
`target_human_email`, `timeout_minutes`). The SDK surface is **camelCase** and
translates at the edge in `sdks/typescript/src/queries.ts`. Do not mix them in
examples.

Agent API keys are prefixed `mge_ag_` (`src/config/auth.ts`). The domain is
`agentdialog.io`; the API is at `api.agentdialog.io`. `agentdialog.com` and
`agentdialog.dev` are wrong and were purged — do not reintroduce them.

All agent routes respond `{ data: ... }`. Follow `src/routes/agent/webhooks.ts`.

**Touching an SDK means updating its docs in the same change** — `docs-site`, the
landing examples in `web/src/components/landing/CodeExamples.tsx`, and the SDK
README, which is what npm renders. A stale example is a trust failure for the
integrator, who is the entire audience of this product.

## Where things live

- Human query flow: `src/services/query.service.ts`, exposed at
  `src/routes/agent/queries.ts` (REST) and `src/mcp/server.ts` (MCP)
- Inbound email replies: `src/services/email-response.service.ts`, reached from
  the provider webhook (`src/routes/webhooks/email-inbound.ts`) and from the
  IMAP poll (`src/routes/internal/email-poll.ts` →
  `src/services/email-ingest.service.ts`). The IMAP half is a scaffold with a
  written exit criterion — see `docs/operations.md`.
- Auth middleware: `src/middleware/agent-auth.ts` and
  `src/middleware/human-auth.ts`
- Design records: `docs/superpowers/specs/` and `docs/superpowers/plans/`
