---
phase: 13-release-v1.0-build-release
plan: 03
status: checkpoint_pending
updated: 2026-03-08
---

# Phase 13 Plan 03: Release Pipeline and Branding Summary (Checkpoint)

## One-line Outcome
Implemented release metadata/branding, updater plumbing, and a manual-dispatch cross-platform Tauri release workflow; now blocked on manual GitHub artifact verification checkpoint.

## Tasks Completed

1. Configured app metadata and DMG branding:
   - Bumped app versions to `1.0.0` in [`ui-react/src-tauri/tauri.conf.json`](ui-react/src-tauri/tauri.conf.json), [`ui-react/package.json`](ui-react/package.json), and [`ui-react/src-tauri/Cargo.toml`](ui-react/src-tauri/Cargo.toml).
   - Updated bundle icon list to use existing Glancier assets (`icon.png`, `icon.icns`, `logo.ico`).
   - Added macOS DMG config and new instructional background image [`ui-react/src-tauri/icons/dmg-background.png`](ui-react/src-tauri/icons/dmg-background.png).
2. Configured release GitHub Action in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
   - Added `workflow_dispatch` trigger.
   - Added `release-tauri` matrix job for `macos-latest` and `windows-latest`.
   - Wired `tauri-apps/tauri-action@v0` release upload with signing env vars.
   - Added prebuild step calling `scripts/build.sh --prepare-only` before Tauri build.
3. Enabled updater configuration:
   - Added updater plugin config placeholders in [`ui-react/src-tauri/tauri.conf.json`](ui-react/src-tauri/tauri.conf.json).
   - Enabled updater artifact generation (`bundle.createUpdaterArtifacts = true`).
   - Added and initialized `tauri-plugin-updater` in [`ui-react/src-tauri/Cargo.toml`](ui-react/src-tauri/Cargo.toml) and [`ui-react/src-tauri/src/lib.rs`](ui-react/src-tauri/src/lib.rs).
4. Hardened build script for CI prebuild usage in [`scripts/build.sh`](scripts/build.sh):
   - Added `--prepare-only` / `SKIP_TAURI_BUILD=1` mode.
   - Added Windows target-triple detection and sidecar extension handling.
   - Kept full local bundle path unchanged when not in prebuild mode.

## Verification

- `npm --prefix ui-react run typecheck`
- `cd ui-react/src-tauri && cargo check`
- `bash -n scripts/build.sh`
- `SKIP_TAURI_BUILD=1 bash scripts/build.sh --prepare-only`
- `rg -n "workflow_dispatch|tauri-action|windows-latest|macos-latest" .github/workflows/ci.yml`
- `rg -n "createUpdaterArtifacts|updater|dmg|background|version" ui-react/src-tauri/tauri.conf.json`

All local checks passed. The prebuild script required running outside sandbox because PyInstaller writes cache under the user Library path.

## Checkpoint (Human Verify)

Manual verification required before marking 13-03 complete:

1. Trigger `CI` workflow manually in GitHub Actions (`workflow_dispatch`).
2. Confirm both `macos-latest` and `windows-latest` release jobs finish and upload artifacts.
3. Validate macOS DMG branding/background and app icon on downloaded artifact.

Resume signal: reply `approved` after manual verification succeeds.
