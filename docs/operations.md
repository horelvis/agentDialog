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

## Where the pieces are hosted

| Piece | Where |
|---|---|
| API | Cloud Run, `us-central1`, service `agentdialog-api` |
| Database | Neon (PostgreSQL) |
| Cache and rate limiting | Upstash (Redis) |
| Landing page and docs | Cloudflare Pages, built from source |
| DNS and CDN | Cloudflare |
| Container images | Artifact Registry, repo `agentdialog` |
| SDK | npm, `@agentdialog/sdk` |

`docs-site/out/` and `docs-site/.next/` are build artifacts and are gitignored.
Cloudflare Pages builds them from source; do not commit them.

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
