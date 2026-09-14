#!/bin/sh
set -e

MINIO_EMBEDDED="${MINIO_EMBEDDED:-true}"

if [ "$MINIO_EMBEDDED" = "true" ]; then
  echo "[entrypoint] Starting embedded MinIO on 127.0.0.1:9000..."
  minio server /data --address 127.0.0.1:9000 --console-address :9001 &
  MINIO_PID=$!

  echo "[entrypoint] Waiting for MinIO to become ready..."
  tries=0
  # bun is the one client guaranteed to be in this image; curl is not.
  until bun -e 'const r = await fetch("http://127.0.0.1:9000/minio/health/live"); process.exit(r.ok ? 0 : 1)' >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
      echo "[entrypoint] ERROR: MinIO did not become ready in time." >&2
      kill "$MINIO_PID" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
  echo "[entrypoint] MinIO ready."
fi

echo "[entrypoint] Running migrations..."
bun run db:migrate || echo "[entrypoint] WARNING: migrations failed (DB may not be ready yet)"

echo "[entrypoint] Starting server..."
exec bun run src/index.ts