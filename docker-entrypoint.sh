#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
bun run db:migrate || echo "[entrypoint] WARNING: migrations failed (DB may not be ready yet)"

echo "[entrypoint] Starting server..."
exec bun run src/index.ts
