# Contributing to AgentDialog

## Getting the project running

You need [Bun](https://bun.sh) 1.4 or newer and Docker. Node is only needed for
the documentation site, which uses npm.

```bash
git clone git@github.com:horelvis/agentDialog.git
cd agentDialog
bun install

cp .env.example .env          # docker compose reads this file, so create it first
docker compose -f docker-compose.dev.yml up -d postgres redis
bun run db:migrate
bun run dev                   # API on http://localhost:3000
```

`docker-compose.dev.yml` also defines `minio` (file storage) and `mailhog` (a
local SMTP catcher on :1025 with a web UI on :8025). Start them when you are
working on file uploads or on anything that sends email:

```bash
docker compose -f docker-compose.dev.yml up -d minio mailhog
```

Without mailhog, email sends fail and the failure is caught and logged. That is
fine for most work — you will see `[EMAIL] Failed to send` in the output and
nothing breaks.

The frontend and the docs site are separate:

```bash
cd web && bun install && bun run dev          # http://localhost:5173
cd docs-site && npm install && npm run dev    # http://localhost:3000, so stop the API first
```

## Tests

```bash
bun test                  # everything, needs the test database
bun run test:unit         # no database needed
bun run test:integration  # needs the test database
```

The integration tests run against a **separate database**, `agentdialog_test`,
configured in `tests/setup.ts`. Create it once:

```bash
docker exec agentdialog_postgres_1 psql -U agentdialog -d agentdialog \
  -c "CREATE DATABASE agentdialog_test"
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun run scripts/migrate.ts
```

The container name depends on your compose project name — check
`docker compose -f docker-compose.dev.yml ps`.

### The integration suite is not hermetic

Agent registration is rate-limited to 10 per hour and the counter lives in Redis,
which persists between runs. Run the suite several times in a row and tests start
failing with `429` where they expect `201`, `409` or `422`. Nothing is broken —
clear the counter:

```bash
docker exec <redis-container> redis-cli -n 1 FLUSHDB
```

Database 1 is the test database; the dev API uses database 0. This is worth
fixing properly some day: the limiter should be disabled or namespaced per run
under `NODE_ENV=test`.

### SDK tests

The SDK has three levels, and they answer different questions:

```bash
cd sdks/typescript
bun test tests        # unit tests against src/, fetch mocked
bun run test:dist     # builds, then tests the emitted dist/
bun run test:pack     # packs the tarball and installs it into a clean project
```

`test:pack` is slow because it really installs `ai` and `@langchain/core` in a
temp directory. It exists because the unit tests import from `src/` and therefore
say nothing about the artifact that goes to npm — a gap that once let a package
ship that could not be built on its own. All three run in CI before publishing.

## Typechecking

```bash
bun run typecheck    # currently FAILS, see below
```

`src/mcp/server.ts` has six pre-existing type errors from an incompatibility
between `@modelcontextprotocol/sdk` and zod's declarations. They do not affect
runtime — Bun strips types without checking them — but they do mean the root
typecheck is red, and `Dockerfile.cloudrun` runs it during the image build.

If you are changing backend code, check your own work in a scoped way rather than
reading the whole output. If you are changing the SDK:

```bash
cd sdks/typescript && bunx tsc --noEmit    # this one is clean and must stay clean
```

## Conventions

Code, comments and commit messages in English.

Commit messages: a short imperative subject, then a body explaining **why**, not
what. The diff already says what.

Formatting and linting use [Biome](https://biomejs.dev):

```bash
bun run lint
bun run format
```

## Pull requests

Branch from `main`, open a PR, and describe the reasoning rather than the
changes. If you found a bug on the way, say so in the PR body — the ones worth
knowing about are usually not the ones the PR was opened for.

If your change touches an SDK, update its documentation in the same PR:
`docs-site/content/docs/sdks/`, the landing examples in
`web/src/components/landing/CodeExamples.tsx`, and the SDK's own README, which is
what npm renders on the package page.

## Releasing

Two separate paths that must not be confused — a GitHub Release deploys the API
and migrates the production database, while an `sdk-v*` tag publishes the SDK.
Both are documented in [`docs/operations.md`](docs/operations.md).

## Where to look

- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit together
- [`docs/operations.md`](docs/operations.md) — workflows, deploys, releases, rollback
- [`docs/api/README.md`](docs/api/README.md) — the full API guide
- [`CLAUDE.md`](CLAUDE.md) — the same ground rules, condensed for AI agents
