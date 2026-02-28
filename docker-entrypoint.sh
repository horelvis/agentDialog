#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
bun run db:migrate

echo "[entrypoint] Starting server..."
exec bun run src/index.ts
