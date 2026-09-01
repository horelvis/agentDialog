#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
GENERATED_DIR="$SCRIPT_DIR/generated"
PUBLIC_VIDEOS_DIR="$REPOSITORY_ROOT/docs-site/public/videos"
TIMELINE="$GENERATED_DIR/timeline.json"
RENDERER="$GENERATED_DIR/render_video"
VIDEO="$PUBLIC_VIDEOS_DIR/langgraph-contract-renewal.mp4"
POSTER="$PUBLIC_VIDEOS_DIR/langgraph-contract-renewal-poster.png"
SUBTITLES="$PUBLIC_VIDEOS_DIR/langgraph-contract-renewal.srt"

if ! "$PYTHON_BIN" -c "from PIL import Image" >/dev/null 2>&1; then
  printf 'Pillow is required to render the video.\n' >&2
  printf "Install it with:\n  '%s' -m pip install -r '%s'\n" \
    "$PYTHON_BIN" "$SCRIPT_DIR/requirements.txt" >&2
  exit 1
fi

"$PYTHON_BIN" -m unittest "$SCRIPT_DIR/test_video_source.py" -v
"$PYTHON_BIN" "$SCRIPT_DIR/render_slides.py"

mkdir -p "$PUBLIC_VIDEOS_DIR"
swiftc -parse-as-library "$SCRIPT_DIR/render_video.swift" -o "$RENDERER"
"$RENDERER" "$TIMELINE" "$VIDEO"
cp "$SCRIPT_DIR/poster.png" "$POSTER"
cp "$GENERATED_DIR/langgraph-contract-renewal.srt" "$SUBTITLES"

printf 'Rendered %s\n' "$VIDEO"
