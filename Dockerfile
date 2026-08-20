FROM oven/bun:1 AS base
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

COPY --from=build /app/docker-entrypoint.sh ./
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
