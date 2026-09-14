FROM oven/bun:1.4 AS base
WORKDIR /app

# Dev stage (for docker-compose.dev.yml)
FROM base AS dev
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS build
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run typecheck

# Build the frontend (landing + human chat UI)
FROM base AS build-frontend
# The build script shells out to ../scripts/sync-integration-guide.sh; that
# script no-ops if its docs/ source isn't present (excluded by .dockerignore),
# but it still needs to exist to be invoked at all.
COPY scripts ./scripts
WORKDIR /app/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/drizzle.config.ts ./

# Frontend build output, served by the API in production (src/app.ts)
COPY --from=build-frontend /app/web/dist ./web/dist

# The first-time agent's orientation document, served at /agent-context.md
# (src/app.ts). An exception in .dockerignore keeps it in the build context.
COPY docs/agent-context.md ./docs/agent-context.md

COPY --from=build /app/docker-entrypoint.sh ./
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]

# On-premise: the whole product in one container, with MinIO embedded.
FROM minio/minio:latest AS minio-source

FROM production AS onprem
COPY --from=minio-source /usr/bin/minio /usr/local/bin/minio
COPY --from=build /app/docker-entrypoint-onprem.sh ./
RUN chmod +x docker-entrypoint-onprem.sh
EXPOSE 3000
CMD ["./docker-entrypoint-onprem.sh"]
