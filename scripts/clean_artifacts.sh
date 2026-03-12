#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DRY_RUN="${1:-}"

ARTIFACT_DIRS=(
  "build"
  "dist"
  "ui-react/dist"
  "ui-react/src-tauri/target"
  "ui-react/test-results"
)

ARTIFACT_FILES=(
  ".coverage"
)

echo "Cleaning generated artifacts under: $ROOT_DIR"

for rel in "${ARTIFACT_DIRS[@]}"; do
  abs="$ROOT_DIR/$rel"
  if [[ -e "$abs" ]]; then
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      echo "[dry-run] remove dir: $rel"
    else
      rm -rf "$abs"
      echo "removed dir: $rel"
    fi
  fi
done

for rel in "${ARTIFACT_FILES[@]}"; do
  abs="$ROOT_DIR/$rel"
  if [[ -e "$abs" ]]; then
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      echo "[dry-run] remove file: $rel"
    else
      rm -f "$abs"
      echo "removed file: $rel"
    fi
  fi
done

shopt -s nullglob
archives=("$ROOT_DIR"/ui-react/src-tauri/binaries/glancier-server-*.tar.gz)
for abs in "${archives[@]}"; do
  rel="${abs#$ROOT_DIR/}"
  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "[dry-run] remove archive: $rel"
  else
    rm -f "$abs"
    echo "removed archive: $rel"
  fi
done
shopt -u nullglob

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "Dry run complete."
else
  echo "Artifact cleanup complete."
fi
