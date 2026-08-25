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

**La etiqueta es la única fuente de la versión.** El build la inyecta como
`APP_VERSION` (`--build-arg` en `deploy.yml`, `ARG`/`ENV` en
`Dockerfile.cloudrun`) y la raíz de la API la lee de ahí. Un build sin etiquetar
responde `dev`, a propósito: antes había un `"0.1.0"` a fuego en
`src/routes/health.ts` que siguió diciéndolo durante toda la vida del producto,
en un sitio donde nadie mira. Si alguna vez vuelves a ver un número de versión
escrito en el código, es esa regresión.

**Antes de cortar la release, actualiza el roadmap.** `docs-site/content/docs/roadmap.mdx`
lleva la versión en el titular de «Available now» y describe en prosa lo que ya
existe; eso no se puede inyectar. Es el único punto del proceso que depende de
que alguien se acuerde, y ya se quedó dos versiones atrás una vez.

### Secrets it needs

| Secret | Used for |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | OIDC federation, replaces a stored key |
| `GCP_SERVICE_ACCOUNT` | the identity the deploy assumes |
| `GCP_PROJECT_ID` | Artifact Registry and Cloud Run target |
| `DATABASE_URL` | production database, for the migration step |

### Verifying a deploy

The workflow verifies itself. After the Cloud Run step it runs
`scripts/smoke-mcp.sh`, which calls an MCP tool the way a client does —
`initialize`, then `tools/call` — and fails the workflow if the tool cannot see
its caller or if an unknown session id answers anything but `404`.

The deploy is already live when it runs. It does not roll anything back; it
makes a broken deploy visible instead of silent. Between v0.7.0 and v0.8.3 every
MCP tool answered `Authentication required` for four days while nothing reported
a problem.

It needs `MCP_SMOKE_API_KEY`: the API key of a dedicated agent registered once
against production. **There is no endpoint that deletes an agent**, so register
one and reuse it — do not have CI create one per deploy, which would also burn
the 10-per-hour registration limit. Without the secret the step fails and says
so.

Run it by hand against any environment:

```bash
MCP_SMOKE_API_KEY=mge_ag_... bash scripts/smoke-mcp.sh https://api.agentdialog.io
```

For the dependencies rather than the product:

```bash
curl -s https://api.agentdialog.io/health
```

Returns `status`, per-dependency checks for database and Redis, and live
WebSocket counts. It says nothing about whether an agent can use the product —
it reported `healthy` throughout the outage above. If a route you just shipped
answers `404` instead of `401`, the deploy did not include it.

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

### Enlaces de respuesta de un solo uso

Una query de riesgo `low` o `medium` sale por email con un enlace a
`/q/<token>` que resuelve esa pregunta sin sesión. La tabla es `query_grants`;
el token se guarda como prefijo indexado más hash bcrypt, igual que los tokens
de sesión.

**El riesgo aceptado, por escrito:** un correo reenviado es una credencial
reenviada. Está acotado — quien tenga el enlace responde esa pregunta y nada
más: no lee el hilo, no ve otras queries, no obtiene sesión — y queda
registrado qué grant se usó. `high` y `critical` no generan enlace.

**No hay endpoint de revocación.** La caducidad y el consumo cubren el caso
normal; un agente que se dé cuenta de haber preguntado a quien no debía usa
`cancel_query`, que mata la query y con ella el enlace.

No hace falta ningún secreto nuevo para esto.

### Configuration and secrets

Configuration is a **hybrid**, which is worth knowing before you touch either half:

- `SMTP_PASS` is a **Secret Manager reference** (`valueFrom`), backed by the
  secret `smtp-password`.
- `WEBHOOK_ENCRYPTION_KEY` is the same kind of reference, backed by its own
  Secret Manager secret. It is the AES-256-GCM key `src/lib/secret-box.ts`
  uses to encrypt webhook signing secrets at rest — never the signing secrets
  themselves. Generate it with `openssl rand -base64 32`. Losing it loses
  every stored signing secret for every agent's webhooks; there is no recovery
  path other than each affected agent calling
  `POST /agent/webhooks/:id/rotate-secret` to get a new one.
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

### Inbound email: tried, measured, rejected

**Nothing reads inbound email.** A human answers a query in the web app. Email
notifies them that a question is waiting and carries their sign-in code, and
that is all it does.

This is worth recording because the obvious cheap fix was built, reviewed and
thrown away, and the next person to reach for it should know why.

The shortcut was to read the `agentdialog.app@gmail.com` mailbox directly over
IMAP with an App Password, using `+` addressing so no DNS work was needed, polled
every five minutes from Cloud Scheduler. It reached code-complete with tests. A
whole-branch review then found three faults, and the first two are not fixable by
being more careful:

- **`\Seen` cannot be both a person's "I read this" and the system's "I processed
  this".** The design marked a message read once ingested, and deliberately never
  touched anyone else's mail so the mailbox stayed usable by a human. Those two
  goals contradict: Gmail marks a message read the moment it is opened, and *Mark
  all as read* is one click. Any reply a person opened before a poll ran was lost
  permanently and silently, with no trace in any log.
- **The unread backlog is re-downloaded forever.** Foreign mail is never marked
  read, so it comes back every pass, and classification happened only after
  fetching the full message body. A few hundred unread messages meant a few
  hundred full downloads every five minutes, 288 times a day, against Gmail
  IMAP's ~2.5 GB/day ceiling. Crossing it throttles the account and takes the
  feature down, presenting as an authentication failure.
- A reply typed *below* the quoted text — Outlook's default — stripped to an
  empty string and was dropped as an empty answer, again silently.

The common thread is that the design modelled the mailbox as an input queue when
it is really a shared inbox with a human co-owner. A consumer mailbox is not a
message broker and does not become one by being polled carefully.

The spec and plan are kept at `docs/superpowers/specs/2026-08-20-inbound-email-ingestion-design.md`
and `docs/superpowers/plans/2026-08-21-inbound-email-ingestion.md` as a record of
the attempt.

#### What replaces it

`POST /api/v1/webhooks/email/inbound` is still deployed and still verifies
provider signatures. It is **dormant**: no provider posts to it, and outbound
mail no longer carries a per-query `Reply-To` for it to match against. That is
the route back, and it is configuration rather than construction — a
transactional provider on a domain we own, its webhook pointed here, and
`INBOUND_EMAIL_WEBHOOK_SECRET` set. Doing it that way also fixes the SPF and
DKIM alignment problem described under **Email** below, which is a reason to do
it eventually regardless of inbound.

#### The one setting that stops replies vanishing

People reply to notification emails whatever the email says. Set an
**auto-responder on the mailbox in `REPLY_TO_ADDRESS`** — Gmail: Settings →
General → Vacation responder, on indefinitely — telling the sender their reply
was not read and pointing them at `https://agentdialog.io`. This is the whole
mitigation, it is a Gmail setting rather than code, and without it a reply
disappears in exactly the silent way that got the IMAP approach rejected.

If `REPLY_TO_ADDRESS` is unset the email carries no `Reply-To` at all, and a
reply goes to `SMTP_FROM` instead. Point one or the other at a mailbox that has
the auto-responder; do not leave both pointing somewhere nobody watches.

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
- **Inbound email is not read at all, by design.** Query emails no longer carry a
  per-query `Reply-To`, and the product no longer tells anyone to answer by
  replying. Neither `agentdialog.io` nor `reply.agentdialog.io` has an MX record
  — confirmed against two resolvers — so a reply to either would reach nothing
  anyway. See "Inbound email: tried, measured, rejected" above for why the
  IMAP workaround was abandoned and what the route back looks like.

## Things that have bitten, and how to recognise them

**`bun run typecheck` at the root was long documented as failing regardless of
your change** — six pre-existing errors in `src/mcp/server.ts`. It no longer
does: `bunx tsc --noEmit` exits 0, verified on `main` as well as here, and
nothing in this repository's recent history changed `src/mcp/server.ts` to make
that happen — the errors were most likely environmental. Treat a failure now as
real. If it fails, the change under test
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
