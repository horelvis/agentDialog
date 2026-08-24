# AgentDialog — notes for agents working in this repo

Agent-first messaging: AI agents ask humans questions, humans answer in the web
chat. Email notifies them and carries their sign-in code; nothing reads inbound
mail. Bun + Hono + PostgreSQL/Drizzle + Redis on the backend, React on the
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
bun test tests/unit tests/integration   # the backend suite — SEE THE TRAP
bun test tests/unit      # no database needed
bun run db:migrate       # apply migrations
bun run typecheck        # SEE THE TRAP BELOW
```

`.github/workflows/ci.yml` runs all of that on every pull request — the whole
suite against Postgres, Redis and MinIO, then typecheck and biome. It does not
block a merge on its own; that needs branch protection enabling on the repo.

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

**`bun run typecheck` at the root was long documented as failing regardless of
your change** — six pre-existing errors in `src/mcp/server.ts`. It no longer
does: `bunx tsc --noEmit` exits 0, and no recent commit touched
`src/mcp/server.ts` to make that happen, so the errors were most likely
environmental. Treat a failure now as real rather than waving it off as the
old, known one. The publish workflow still deliberately typechecks only the SDK.

**An MCP tool's caller arrives in `authInfo.extra`, nowhere else.** The SDK
builds a handler's `extra` by naming fields one at a time — `authInfo`,
`requestId`, `requestInfo` and a few more — instead of spreading what the
transport received, so a property set on the transport's own extra is dropped
before any handler sees it. `src/mcp/transport.ts` puts the agent in
`authInfo.extra` and passes it **per request** to `handleRequest`; deriving it
from the session would let anyone holding another agent's `mcp-session-id` act
as that agent. This was broken in production from v0.7.0 until the fix that added this note: the older
code mutated `extra.agentId`, which worked against the SDK current when it was
written and silently stopped when the lockfile moved to 1.30.0. Every tool
answered `Authentication required` while the whole suite stayed green, because
the tests handed the handlers a bare `{ agentId }` — a shape no transport can
produce. Test MCP over the real HTTP path, as
`tests/integration/mcp-transport-identity.test.ts` does.

**MCP sessions live in the process's memory, so a session id outlives its
session routinely** — a deploy, an instance recycle, the 30-minute TTL sweep, or
a request landing on one of the other instances (`max-instances=10`;
`--session-affinity` is best effort). The protocol reserves **404** for an id the
server does not know, and a client reads that as "open a new session". Returning
400 instead leaves it stuck until somebody reconnects it by hand, which is what
`src/mcp/transport.ts` used to do by handing the request to a fresh, uninitialised
transport. Keep the 404 branch.

**A bare `bun test` at the root is not "everything", it is more than can
run — and `bun test tests/` does not fix it.** Bun's arguments are substring
filters over each file's path, not directories, so `tests/` also matches
`sdks/typescript/tests/`. From the root, Bun collects the SDK's suite, which
needs `sdks/typescript/node_modules`, and `sdks/typescript/packaged/`, which
asserts against the built output in `dist/`. Neither is produced by any root
command and git tracks neither, so both exist only on a machine that has worked
on the SDK — where they quietly pass, and on a clean checkout fail with
`Cannot find package 'ai'` and `ENOENT`. That is why local runs reported 224
passing all day when a fresh clone reproduces **190**.

Name both paths: `bun test tests/unit tests/integration`. CI runs that, gives the
SDK its own job with its own install, and leaves `packaged/` to
`publish-sdk.yml`, which builds first. Found by CI on its first two runs.

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
- Human answers: `src/routes/human/queries.ts` → `respondQuery` in
  `src/services/query.service.ts`. The web chat is the only live path.
- Inbound email: **dormant**. `src/services/email-response.service.ts` is reached
  only from the provider webhook (`src/routes/webhooks/email-inbound.ts`), which
  nothing calls, and outbound mail no longer carries a per-query `Reply-To` for
  it to match. An IMAP-polling workaround was built and rejected — read
  `docs/operations.md` before reaching for that idea again.
- Auth middleware: `src/middleware/agent-auth.ts` and
  `src/middleware/human-auth.ts`
- Design records: `docs/superpowers/specs/` and `docs/superpowers/plans/`
