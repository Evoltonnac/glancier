# Build Path Contract

This document defines the canonical command entrypoints and artifact path ownership for the Python + React + Tauri workspace.

## Goals

- One command entrypoint for daily usage.
- Predictable artifact locations per layer.
- Explicit separation of source paths and generated paths.

## Canonical Commands

Use root `Makefile` commands first:

| Command | Purpose | Underlying command |
| --- | --- | --- |
| `make dev` | Backend + web frontend dev mode | `npm --prefix ui-react run dev:all` |
| `make dev-tauri` | Backend + Tauri dev mode | `npm --prefix ui-react run tauri:dev:all` |
| `make build-backend` | Build Python sidecar archive only | `bash scripts/build.sh --prepare-only` |
| `make build-desktop` | Build desktop package | `npm --prefix ui-react run tauri:build` |
| `make test-backend` | Backend core gate | `bash scripts/test_backend_core.sh` |
| `make test-frontend` | Frontend core gate | `bash scripts/test_frontend_core.sh` |
| `make test-typecheck` | Frontend core + typecheck gate | `bash scripts/test_frontend_core.sh --with-typecheck` |
| `make test-impacted` | Impacted-only gate | `bash scripts/test_impacted.sh` |
| `make gen-schemas` | Generate schema outputs | `python scripts/generate_schemas.py` |
| `make clean-artifacts` | Remove generated outputs | `bash scripts/clean_artifacts.sh` |

## Remaining Direct npm Commands (Advanced)

These remain valid, but are secondary to `make` entrypoints:

| Location | Command | Status |
| --- | --- | --- |
| `ui-react/package.json` | `npm --prefix ui-react run dev` | Keep (web-only debug) |
| `ui-react/package.json` | `npm --prefix ui-react run dev:backend` | Keep (backend-only helper from UI workspace) |
| `ui-react/package.json` | `npm --prefix ui-react run tauri` | Keep (raw Tauri CLI passthrough) |
| `ui-react/package.json` | `npm --prefix ui-react run tauri:dev` | Keep (desktop shell debug) |
| `ui-react/package.json` | `npm --prefix ui-react run preview` | Keep (preview built web assets) |
| `ui-react/package.json` | `npm --prefix ui-react run test` | Keep (full frontend test runner) |
| `ui-react/package.json` | `npm --prefix ui-react run test:core` | Keep (focused core suite) |
| `ui-react/package.json` | `npm --prefix ui-react run typecheck` | Keep (TS validation) |
| `ui-react/package.json` | `npm --prefix ui-react run audit:high` | Keep (security audit, on-demand) |

## Remaining Scripts Inventory

| Script | Status | Notes |
| --- | --- | --- |
| `scripts/build.sh` | Keep | Sidecar + desktop build bridge |
| `scripts/clean_artifacts.sh` | Keep | Unified artifact cleanup |
| `scripts/test_backend_core.sh` | Keep | Backend core gate |
| `scripts/test_frontend_core.sh` | Keep | Frontend core gate |
| `scripts/test_impacted.sh` | Keep | Changed-file gate |
| `scripts/dev_server.py` | Keep | Backend autoreload in local dev |
| `scripts/generate_schemas.py` | Keep | Integration schema generation utility |

## Artifact Ownership

| Path | Owner | Type | Commit policy |
| --- | --- | --- | --- |
| `build/` | PyInstaller | Intermediate build output | Do not commit |
| `dist/glancier-server/` | PyInstaller | Sidecar runtime folder | Do not commit |
| `ui-react/dist/` | Vite | Frontend build output | Do not commit |
| `ui-react/src-tauri/target/` | Cargo/Tauri | Rust/Tauri build output | Do not commit |
| `ui-react/src-tauri/binaries/glancier-server-*.tar.gz` | `scripts/build.sh` | Sidecar archive for packaging | Do not commit |
| `ui-react/test-results/` | Playwright | E2E results | Do not commit |
| `.coverage` | pytest coverage | Local report artifact | Do not commit |

## Build Flow Contract

1. Python sidecar build:
   `main.py` -> `build/glancier-server/` + `dist/glancier-server/` -> `ui-react/src-tauri/binaries/glancier-server-<target>.tar.gz`
2. Frontend build:
   `ui-react/src/` -> `ui-react/dist/`
3. Desktop bundle:
   `ui-react/dist/` + sidecar archive -> `ui-react/src-tauri/target/release/bundle/`

## Script and npm Command Audit (2026-03-09)

- Checked: `scripts/*.sh` shell syntax (`bash -n`) passed.
- Checked: Python entry scripts compile (`python -m py_compile`) passed.
- Checked: npm scripts in `ui-react/package.json` resolve referenced files (paths exist).
- Action taken: removed redundant `make build-desktop-prepare` alias to reduce duplicate entrypoints.
- Action taken: added `make test-impacted` and `make gen-schemas` so commonly used scripts are covered by the same root entrypoint.

## Cleanup Contract

- Preview cleanup: `bash scripts/clean_artifacts.sh --dry-run`
- Actual cleanup: `make clean-artifacts`
