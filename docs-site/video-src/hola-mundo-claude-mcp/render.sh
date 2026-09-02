#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
DOCS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
OUTPUT_DIR="$DOCS_DIR/public/videos"
PYTHON_BIN="${PYTHON_BIN:-python3}"

mkdir -p "$OUTPUT_DIR"
"$PYTHON_BIN" "$SCRIPT_DIR/render_slides.py"
swiftc -parse-as-library "$SCRIPT_DIR/render_video.swift" \
  -o "$SCRIPT_DIR/generated/render_video"
"$SCRIPT_DIR/generated/render_video" \
  "$SCRIPT_DIR/generated/timeline.json" \
  "$OUTPUT_DIR/hola-mundo-claude-mcp.mp4"

cp "$SCRIPT_DIR/poster.png" "$OUTPUT_DIR/hola-mundo-claude-mcp-poster.png"
cp "$SCRIPT_DIR/generated/hola-mundo-claude-mcp.srt" \
  "$OUTPUT_DIR/hola-mundo-claude-mcp.srt"

echo "Video: $OUTPUT_DIR/hola-mundo-claude-mcp.mp4"

