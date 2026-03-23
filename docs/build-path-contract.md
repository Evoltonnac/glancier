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
| `make build-mac` | Build macOS arm64 desktop package (.dmg) | `npm --prefix ui-react run tauri:build:mac` |
| `make build-win` | Build Windows x64 desktop package (.exe) | `npm --prefix ui-react run tauri:build:win` |
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
| `ui-react/package.json` | `npm --prefix ui-react run tauri:build` | Keep (host-platform auto build wrapper, compatibility) |
| `ui-react/package.json` | `npm --prefix ui-react run tauri:build:mac` | Keep (explicit macOS package build) |
| `ui-react/package.json` | `npm --prefix ui-react run tauri:build:win` | Keep (explicit Windows package build) |
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
| `dist/glanceus-server/` | PyInstaller | Sidecar runtime folder | Do not commit |
| `ui-react/dist/` | Vite | Frontend build output | Do not commit |
| `ui-react/src-tauri/target/` | Cargo/Tauri | Rust/Tauri build output | Do not commit |
| `ui-react/src-tauri/binaries/` | `scripts/build.sh` | Sidecar archive staging directory | Keep only generated archives needed for packaging; do not commit generated platform folders |
| `ui-react/src-tauri/binaries/glanceus-server-*.tar.gz` | `scripts/build.sh` | Sidecar archive for packaging | Do not commit |
| `ui-react/test-results/` | Playwright | E2E results | Do not commit |
| `.coverage` | pytest coverage | Local report artifact | Do not commit |

## Build Flow Contract

1. Python sidecar build:
   `main.py` -> `build/glanceus-server/` + `dist/glanceus-server/` -> `ui-react/src-tauri/binaries/glanceus-server-<target>.tar.gz`
2. Frontend build:
   `ui-react/src/` -> `ui-react/dist/`
3. Desktop bundle:
   `ui-react/dist/` + sidecar archive -> `ui-react/src-tauri/target/release/bundle/`

## CI Release Contract

The GitHub Actions release job is defined in `.github/workflows/ci.yml` as `release-tauri`.

- Trigger policy: manual run only (`workflow_dispatch`).
- Matrix policy:
  - `macos-15` -> `aarch64-apple-darwin` -> `--bundles app,dmg`
  - `macos-15-intel` -> `x86_64-apple-darwin` -> `--bundles app,dmg`
  - `windows-latest` -> `x86_64-pc-windows-msvc` -> `--bundles nsis`
- Prebuild policy: run `bash scripts/build.sh --prepare-only` with `SKIP_TAURI_BUILD=1` before `npm run tauri build`, so sidecar archives are staged under `ui-react/src-tauri/binaries/`.
- Updater policy: `createUpdaterArtifacts` is `true`; updater archives and signatures are generated and signed for release distribution.
- Release upload policy: upload updater archive/signature from `ui-react/src-tauri/target/<target>/release/bundle/**/*.app.tar.gz(.sig)`.
- Manifest policy: upload `latest.json` as release asset `latest.json`; if Tauri does not output `latest.json`, CI generates it from the produced updater archive/signature and target mapping.
- Signing inputs: set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub repository secrets before running `release-tauri`.

## Runtime Update Contract

- In-app update check (Settings -> `Check Updates`) must use Tauri updater metadata (`latest.json`) instead of redirecting users to GitHub Releases.
- When an update is available, the client must call updater download/install flow to fetch signed updater artifacts (for macOS: `*.app.tar.gz` + `*.app.tar.gz.sig`).
- After successful install, the desktop runtime must relaunch the app process so the replaced bundle is activated without a manual installer flow.

## Script and npm Command Audit (2026-03-09)

- Checked: `scripts/*.sh` shell syntax (`bash -n`) passed.
- Checked: Python entry scripts compile (`python -m py_compile`) passed.
- Checked: npm scripts in `ui-react/package.json` resolve referenced files (paths exist).
- Action taken: removed redundant `make build-desktop-prepare` alias to reduce duplicate entrypoints.
- Action taken: added `make test-impacted` and `make gen-schemas` so commonly used scripts are covered by the same root entrypoint.

## Cleanup Contract

- Preview cleanup: `bash scripts/clean_artifacts.sh --dry-run`
- Actual cleanup: `make clean-artifacts`
