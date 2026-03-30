#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/ui-react"

if [[ "${1:-}" == "--full" || "${RUN_FULL:-0}" == "1" ]]; then
  pnpm run test -- --run
  pnpm run typecheck
  exit 0
fi

pnpm run test:core

if [[ "${1:-}" == "--with-typecheck" || "${WITH_TYPECHECK:-0}" == "1" ]]; then
  pnpm run typecheck
fi
