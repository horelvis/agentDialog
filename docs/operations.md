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

Three things live in Google Cloud: the container image registry, the service that
runs the container, and the Cloud Storage bucket behind the `MINIO_*` variables.
The database and Redis are managed elsewhere, reached over the network with
credentials supplied as environment variables. The static sites never touch GCP.

The project is `agentdialog`, owned by a different Google account than the one
that owns the product's Gmail address. That split is normal and only matters when
setting up OAuth, where the client lives in the project and the consent is given
by the mailbox's own account.

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

Configuration is a **hybrid**, which is worth knowing before you touch either half:

- `SMTP_PASS` is a **Secret Manager reference** (`valueFrom`), backed by the
  secret `smtp-password`.
- Every other variable is a **plain environment variable** on the service.

Four further secrets exist in Secret Manager — `SMTP_FROM`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER` — that nothing references. They are leftovers from the
original setup and none of them is sensitive.

The trade-off of plain environment variables is worth knowing rather than
rediscovering: they are simpler and cost nothing, but they are visible to anyone
with `run.services.get` on the project, they are not versioned, and rotating one
requires a service update. For the current scale that is acceptable; for a team
it would not be.

<!-- DANGER -->
**`scripts/cleanup-secrets.sh` will break outbound email if you run it today.**
It calls `gcloud run services update --clear-secrets`, which removes *every*
secret reference from the service — including the live `SMTP_PASS`. Its hardcoded
list of secrets to delete (`database-url`, `redis-url`, `session-secret`) does not
match what actually exists, and omits the four that do. The script was written for
a configuration this project no longer has. Do not run it without rewriting it.

`src/env.ts` validates everything at startup with zod and exits if a variable is
missing or malformed, so a misconfigured deploy fails immediately and loudly
rather than at the first request that needs the value.

### Inbound email: a scaffold with an exit criterion

Replies to query emails are read out of the `agentdialog.app@gmail.com` mailbox
over IMAP, by a Cloud Scheduler job that calls the API every five minutes. This
is a bridge, not the architecture: `POST /api/v1/webhooks/email/inbound` already
implements the provider→webhook pattern, and the day a transactional provider
sits on a domain we own, there is nothing to build — only to configure.

**Retire the scaffold when** a provider is contracted and the MX records of an
owned domain point at it, or the volume approaches Gmail's ~500/day sending cap,
or someone reports that query emails land in spam. Retiring it is:

1. Configure the provider's webhook and its `INBOUND_EMAIL_WEBHOOK_SECRET`.
2. Delete `src/lib/mailbox.ts`, `src/services/email-ingest.service.ts` and
   `src/routes/internal/email-poll.ts`.
3. Remove the `emailPollRoutes` import and the
   `app.route("/api/v1/internal/email", emailPollRoutes)` mount from
   `src/app.ts` — leaving the route file deleted but still imported there
   breaks the build.
4. Remove `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD` and
   `INTERNAL_POLL_SECRET` from `src/env.ts`'s schema and from `.env.example`.
5. Delete the Scheduler job and the `imap-password` secret.
6. Point `REPLY_LOCAL_PART` and `REPLY_DOMAIN` back at the owned domain.

Both paths enter the domain through `processEmailReply`, so nothing in the
webhook route or the query/email services notices — but `src/app.ts` and
`src/env.ts` do reference the scaffold directly and need the edits above, not
just a deletion of the service files.

Written down because otherwise it becomes permanent by inertia, which is how
almost every scaffold ends.

The Scheduler job polls every five minutes; the lock that serializes overlapping
passes (`INGEST_LOCK_KEY` in `src/services/email-ingest.service.ts`) holds it
for `INGEST_LOCK_TTL_MS`, currently 600,000 ms (ten minutes) — two poll
intervals, not one. A TTL shorter than the poll interval cannot block a
scheduled poll at all: by the time the next poll fires, any pass still running
has already outlived a shorter TTL, so the lock would already have expired. If
you change the Scheduler's `--schedule`, change `INGEST_LOCK_TTL_MS` with it, and
keep the TTL comfortably longer than the interval.

#### One-time setup

1. In `agentdialog.app@gmail.com`, confirm IMAP is on: Settings → Forwarding and
   POP/IMAP → Enable IMAP.
2. Generate an App Password for that account (requires 2FA, which is on). This
   is the same class of credential as `SMTP_PASS`, which is also an App Password.
3. Store it in Secret Manager rather than as a plain variable:

   ```bash
   printf '%s' '<app-password>' | gcloud secrets create imap-password \
     --project agentdialog --data-file=-
   ```

4. Update the Cloud Run service. **`--update-env-vars`, never `--set-env-vars`** —
   the latter would delete the nineteen variables already on the service:

   ```bash
   gcloud run services update agentdialog-api \
     --project agentdialog --region us-central1 \
     --update-env-vars \
IMAP_HOST=imap.gmail.com,IMAP_PORT=993,IMAP_USER=agentdialog.app@gmail.com,REPLY_LOCAL_PART=agentdialog.app,REPLY_DOMAIN=gmail.com,INTERNAL_POLL_SECRET=<generated> \
     --update-secrets IMAP_PASSWORD=imap-password:latest
   ```

   Generate the poll secret with `openssl rand -hex 32`.

5. Create the Scheduler job:

   ```bash
   gcloud scheduler jobs create http agentdialog-email-poll \
     --project agentdialog --location us-central1 \
     --schedule "*/5 * * * *" \
     --uri "https://api.agentdialog.io/api/v1/internal/email/poll" \
     --http-method POST \
     --headers "x-internal-secret=<the same value>" \
     --attempt-deadline 120s
   ```

`REPLY_LOCAL_PART` and `REPLY_DOMAIN` are what make the change take effect for
new queries: from then on the Reply-To is `agentdialog.app+{queryId}@gmail.com`,
which Gmail delivers to the account's inbox with no DNS involved. Queries sent
before the change carry the old `reply+{queryId}@reply.agentdialog.io`, which
has no MX and never arrived anyway.

#### Checking it

```bash
curl -s -X POST https://api.agentdialog.io/api/v1/internal/email/poll \
  -H "x-internal-secret: $INTERNAL_POLL_SECRET" | jq
```

`{"data":{"scanned":0,...}}` means it connected and the mailbox was empty.
`401 UNAUTHORIZED` means the `x-internal-secret` header is missing or does not
match `INTERNAL_POLL_SECRET` — check the Scheduler job's header first, it is
the likely first-day mistake.
`503 MAILBOX_NOT_CONFIGURED` means the IMAP variables did not reach the service.
`502 MAILBOX_UNAVAILABLE` means they did and Gmail refused them — almost always
the App Password.
`500 INGEST_FAILED` means the pass itself threw, most likely a database
outage; nothing is lost when this happens — any message the pass couldn't
process is left unread, and the next pass retries it.

`{"data":{"skipped":true}}` means another pass held the lock, which is normal.

Counts in the summary: `processed` recorded a reply, `rejected` was a reply from
someone other than the target, `dropped` was ours but unusable, `skipped` was
somebody else's mail — left unread on purpose — and `deferred` will be retried
by the next pass.

#### Manual verification against the real mailbox

The one path nothing automated covers: a real message, in a real Gmail inbox,
read back by `imapflow`. Do this once after the one-time setup above, with
`.env` pointing at the real mailbox and `bun run dev` running:

1. Create a query with your own address as the recipient:

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/agent/queries \
     -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \
     -d '{"query_type":"validation","question":"Does the IMAP bridge work?","target_human_email":"you@example.com","timeout_minutes":60}' | jq
   ```

2. Check the email you receive: `Reply-To` should be
   `agentdialog.app+{queryId}@gmail.com`.
3. Reply from that same address.
4. Trigger a pass:

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/internal/email/poll \
     -H "x-internal-secret: $INTERNAL_POLL_SECRET" | jq
   ```

   Expect `processed: 1`.
5. Read the query back and confirm `status` is `answered` and `answer` is what
   you wrote, with the quoted original message stripped out.
6. Poll again: expect `scanned: 0`, because the message was marked read.
7. Send an unrelated email to `agentdialog.app@gmail.com`, poll, and confirm it
   is still **unread** in the mailbox (acceptance criterion 3).
8. Reply to the query from an address other than the recipient's and confirm the
   sender gets a mismatch notice while the query is unchanged (criterion 2).

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

The `MINIO_*` variables are a misnomer in production: they point at
`storage.googleapis.com`, so file storage is **Google Cloud Storage** through its
S3-compatible API, bucket `agentdialog-files`. Development uses real MinIO from
`docker-compose.dev.yml`. The variable names come from the development setup and
were never renamed.

### Email

Outbound email goes through **Gmail SMTP** (`smtp.gmail.com:465`), not through
Resend or any transactional provider. Resend appears in the codebase only as the
default value of `INBOUND_EMAIL_PROVIDER` and in the changelog; no Resend account
is configured.

Two consequences worth knowing:

- A consumer Gmail account caps at roughly 500 messages a day, and messages sent
  from a `@gmail.com` address on behalf of `agentdialog.io` have no aligned SPF
  or DKIM, which costs deliverability.
- **Inbound email is not commissioned yet.** By default, query emails carry a
  `Reply-To` of `reply+{queryId}@reply.agentdialog.io`, but neither
  `agentdialog.io` nor `reply.agentdialog.io` has an MX record — confirmed
  against two resolvers — so a human's reply bounces and reaches nothing.
  `POST /api/v1/webhooks/email/inbound` is deployed and reachable, but no
  provider ever calls it. An IMAP-polling scaffold that reads a Gmail inbox
  instead exists and is code-complete; see "Inbound email: a scaffold with an
  exit criterion" above for what turning it on requires. Until that one-time
  setup runs, the feature the landing page sells is not operational.

## Things that have bitten, and how to recognise them

**`bun run typecheck` at the root used to fail regardless of your change** —
six pre-existing errors in `src/mcp/server.ts`. That has been fixed: `bunx tsc
--noEmit` exits 0 as of this branch. If it fails now, the change under test
broke something real — do not wave it off as the old, known failure. This
still means `Dockerfile.cloudrun` — which runs it — is sensitive to any zod
resolution change; see the `overrides` entry in the root `package.json`.

**A Docker build resolving unexpected dependency versions.** The `COPY` globs
must be `bun.lock*`. Bun 1.4 writes a text lockfile, and the old `bun.lockb*`
glob matched nothing, so `--frozen-lockfile` ran with no lockfile at all.

**A newly published npm version returning 404.** Propagation to the read path
takes a few minutes for a new package even though the write succeeded.
`npm access list packages` confirms ownership immediately; the search index and
`npm install` catch up afterwards.
