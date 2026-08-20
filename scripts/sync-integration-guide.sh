#!/bin/bash
# Copy the API guide into the web app's public folder.
# docs/api/README.md is the source of truth; the public copy is generated.
#
# Paths resolve from this script's own location, not the caller's, because
# web/package.json runs it with the web directory as the working directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/docs/api/README.md"
DEST="$ROOT/web/public/agentdialog-integration-guide.md"

# In the frontend-only Docker build context, docs/ is not copied in (it's
# excluded by .dockerignore) so $SRC won't exist. The committed copy at
# $DEST is already correct for that build, so just skip regenerating it.
if [ ! -f "$SRC" ]; then
  echo "Skipping sync: $SRC not found (expected in the frontend-only Docker build)"
  exit 0
fi

cp "$SRC" "$DEST"
echo "Synced $SRC -> $DEST"
