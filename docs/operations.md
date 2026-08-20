# Operations

Everything about getting code into production, and what to do when that goes
wrong.

## Two release paths, and why confusing them is expensive

| What you want | What you do | What runs |
|---|---|---|
| Deploy the API | Publish a **GitHub Release** with a `vX.Y.Z` tag | `.github/workflows/deploy.yml` |
| Publish the SDK | Push a bare **`sdk-vX.Y.Z` tag** | `.github/workflows/publish-sdk.yml` |

`deploy.yml` triggers on *any* published release and **runs migrations against
the production database**. Publishing the SDK through a GitHub Release would
therefore migrate production and redeploy the API as a side effect of a version
bump. The workflow carries a guard:

```yaml
if: ${{ !startsWith(github.event.release.tag_name, 'sdk-v') }}
```

The guard is a safety net, not the plan. Publish the SDK with a plain tag push
and the two paths never meet.

## Deploying the API

Cut a GitHub Release whose tag is the version:

```bash
gh release create v0.8.0 --target main --title "v0.8.0 - what changed" --notes "..."
```

`deploy.yml` then, in order:

1. authenticates to Google Cloud via **Workload Identity Federation** — no
   service-account key is stored
2. builds `Dockerfile.cloudrun`, tagging the image with both the release tag and
   `latest`
3. pushes to Artifact Registry
4. **runs `bun run db:migrate`** inside that exact image, against
   `secrets.DATABASE_URL`
5. deploys to Cloud Run
6. prints the service URL

Migrations run from the image being deployed, so the schema can never be migrated
by a different build than the one that ends up serving traffic.

### Secrets it needs

| Secret | Used for |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | OIDC federation, replaces a stored key |
| `GCP_SERVICE_ACCOUNT` | the identity the deploy assumes |
| `GCP_PROJECT_ID` | Artifact Registry and Cloud Run target |
| `DATABASE_URL` | production database, for the migration step |

### Verifying a deploy

```bash
curl -s https://api.agentdialog.io/health
```

Returns `status`, per-dependency checks for database and Redis, and live
WebSocket counts. If a route you just shipped answers `404` instead of `401`, the
deploy did not include it.

### Deploying by hand

`scripts/deploy.sh` exists for when CI is unavailable:

```bash
GCP_PROJECT_ID=your-project ./scripts/deploy.sh
```

**Read it before you run it.** It passes `--min-instances=0`, which would undo
the setting raised to 1 for MCP session stability, and it does **not** run
migrations. It is a fallback, not an equivalent of the workflow.

### Rolling back

Cloud Run keeps revisions. Rolling back the code is immediate:

```bash
gcloud run revisions list --service=agentdialog-api --region=us-central1
gcloud run services update-traffic agentdialog-api \
  --region=us-central1 --to-revisions=REVISION_NAME=100
```

Migrations do not roll back. If a release migrated the schema, moving traffic to
an older revision leaves that revision running against a newer schema. Write
migrations so the previous version still works against them, or accept that a
rollback needs a matching down-migration written by hand.

## Publishing the SDK

```bash
# bump "version" in sdks/typescript/package.json, merge it, then
git checkout main && git pull
git tag sdk-v0.1.2
git push origin sdk-v0.1.2
```

`publish-sdk.yml` runs the root unit tests, then the SDK's typecheck, unit tests,
build, `packaged/` tests against `dist/`, and the tarball smoke test — and only
then publishes. Everything before the publish step exists because **an npm
version cannot be replaced once it is out**. The release has to fail in CI or not
at all.

Authentication is **npm Trusted Publishing over OIDC**. There is no `NPM_TOKEN`
anywhere in the repository, and no OTP is involved. It requires
`permissions: id-token: write` and npm ≥ 11.5.1, which is why the workflow pins
the npm version explicitly rather than trusting the runner image.

The trusted publisher is registered on npm against repository
`horelvis/agentDialog` and workflow `publish-sdk.yml`. All fields are
case-sensitive.

### Verifying a publish

```bash
npm view @agentdialog/sdk version
npm view @agentdialog/sdk@X.Y.Z dist --json    # must show "attestations"
```

Provenance is the signal that the release really came from the workflow.
`0.1.0` was published by hand and has none; every version from `0.1.1` does.

### Publishing by hand

Only needed to bootstrap a brand-new package, since a trusted publisher can only
be registered on a package that already exists. It requires an npm login created
**after** 2FA was enabled on the account — a session token minted before that
gets a 403 no matter how valid the OTP is.

```bash
cd sdks/typescript && bun run build
npm publish --otp=CODE
```

`--access public` is no longer needed: `publishConfig` in the manifest carries it.

## Reading the logs

```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=agentdialog-api' \
  --limit=50 --format='value(textPayload)'
```

Every request line carries the request ID attached by the middleware, so an
error can be traced back through the request that caused it.

## Infrastructure

### The shape of it

```
                       ┌──────────────────────────────────┐
   agentdialog.io ────►│ Cloudflare                       │
   docs.agentdialog.io │  DNS, CDN, Pages (landing + docs)│
                       └───────────────┬──────────────────┘
                                       │
   api.agentdialog.io ─────────────────┤ domain mapping
                                       ▼
                       ┌──────────────────────────────────┐
                       │ Google Cloud                     │
                       │                                  │
                       │  Cloud Run   agentdialog-api     │
                       │      ▲       :8080, us-central1  │
                       │      │                           │
                       │  Artifact Registry               │
                       │      repo: agentdialog           │
                       │      ▲                           │
                       │      │ Workload Identity         │
                       │      │ Federation (no keys)      │
                       └──────┼───────────────────────────┘
                              │                │        │
                     GitHub Actions            │        │
                                               ▼        ▼
                                          Neon        Upstash
                                       (PostgreSQL)   (Redis)
```

Only two things live in Google Cloud: the container image registry and the
service that runs the container. The database and Redis are managed elsewhere,
reached over the network with credentials supplied as environment variables. The
static sites never touch GCP at all.

### Google Cloud

**Cloud Run**, service `agentdialog-api` in `us-central1`, is the whole backend —
API, WebSocket server and MCP server in one container. It serves the built
landing page as static files too, which is why `Dockerfile.cloudrun` builds both
the backend and `web/` into a single image.

The service configuration, as `deploy.yml` sets it on every deploy:

| Setting | Value | Why |
|---|---|---|
| `--port` | 8080 | Cloud Run's expected port |
| `--cpu` / `--memory` | 1 / 512Mi | |
| `--min-instances` | **1** | Keeps one instance warm. MCP sessions are stateful and a cold start drops them |
| `--max-instances` | 10 | |
| `--timeout` | 300s | WebSocket connections need a long request timeout |
| `--concurrency` | 80 | |
| `--session-affinity` | on | Routes a client back to the same instance, which the WebSocket registry assumes |
| `--allow-unauthenticated` | on | The API does its own auth |

`--min-instances=1` and `--session-affinity` are not tuning knobs, they are
correctness requirements: the WebSocket connection registry lives in the
instance's memory, and MCP sessions are stateful. Dropping either breaks live
connections in ways that look like intermittent bugs.

**Artifact Registry**, repository `agentdialog` in the same region, holds the
images. Every deploy pushes two tags: the release tag and `latest`.

**Workload Identity Federation** authenticates GitHub Actions. No service account
key is stored anywhere — the workflow exchanges its OIDC token for short-lived
credentials, the same mechanism the npm publish uses. The three GitHub secrets
(`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`)
identify the federation, they are not credentials.

### Outside Google Cloud

| Piece | Where | Notes |
|---|---|---|
| PostgreSQL | Neon | Reached via `DATABASE_URL` |
| Redis | Upstash | Sessions, rate limiting, MCP session state |
| Landing page and docs | Cloudflare Pages | Built from source on push |
| DNS and CDN | Cloudflare | Also fronts `api.agentdialog.io` |
| SDK | npm | `@agentdialog/sdk` |

`docs-site/out/` and `docs-site/.next/` are build artifacts and gitignored.
Cloudflare Pages builds them from source; do not commit them.

### Configuration and secrets

Runtime configuration is **environment variables on the Cloud Run service**, not
Secret Manager. `scripts/cleanup-secrets.sh` exists to tear down the Secret
Manager entries from an earlier setup and prints the `gcloud run services update`
command that replaces them.

The trade-off is worth knowing rather than rediscovering: environment variables
are simpler and cost nothing, but they are visible to anyone with
`run.services.get` on the project, they are not versioned, and rotating one
requires a service update. For the current scale that is an acceptable trade;
for a team it would not be.

`src/env.ts` validates everything at startup with zod and exits if a variable is
missing or malformed, so a misconfigured deploy fails immediately and loudly
rather than at the first request that needs the value.

### Three ways to deploy, and only one that is current

| Path | Used | min-instances |
|---|---|---|
| `.github/workflows/deploy.yml` | **yes**, on a published release | 1 |
| `scripts/deploy.sh` | fallback, by hand | 1 |
| `cloudbuild.yaml` | not wired to a trigger | 1 |

All three now agree. They did not: the two fallbacks passed `--min-instances=0`,
so either one would have silently reverted the warm instance and broken MCP
sessions. If you add a fourth path, keep it in step.

`cloudbuild.yaml` is a Cloud Build pipeline that no trigger currently invokes. It
is kept as an escape hatch for building inside GCP if GitHub Actions is
unavailable; it needs `_REGION` and `_SERVICE_NAME` substitutions.

### What is not in this repository

These live only in the Google Cloud and Cloudflare consoles, and nothing here
reproduces them:

- the domain mapping from `api.agentdialog.io` to the Cloud Run service
- the Workload Identity pool and provider, and the service account's IAM bindings
- the actual environment variable values on the service
- the Cloudflare Pages projects, their build commands and output directories
- the Neon and Upstash instances

If the project ever needs rebuilding from scratch, that list is the gap. Writing
it down as Terraform is the obvious next step and has not been done.

### File storage

`src/config/storage.ts` and the `MINIO_*` variables target an S3-compatible
store; development uses MinIO from `docker-compose.dev.yml`. **What backs this in
production is not recorded anywhere in the repository** — verify against the
Cloud Run service's environment variables before relying on it.

## Things that have bitten, and how to recognise them

**`bun run typecheck` fails at the root.** Six pre-existing errors in
`src/mcp/server.ts`. It is not your change. It also means
`Dockerfile.cloudrun` — which runs it — is sensitive to any zod resolution
change; see the `overrides` entry in the root `package.json`.

**A Docker build resolving unexpected dependency versions.** The `COPY` globs
must be `bun.lock*`. Bun 1.4 writes a text lockfile, and the old `bun.lockb*`
glob matched nothing, so `--frozen-lockfile` ran with no lockfile at all.

**A newly published npm version returning 404.** Propagation to the read path
takes a few minutes for a new package even though the write succeeded.
`npm access list packages` confirms ownership immediately; the search index and
`npm install` catch up afterwards.
