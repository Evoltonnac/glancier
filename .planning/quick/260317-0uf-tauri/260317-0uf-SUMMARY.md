# Quick Task 260317-0uf Summary

**Description:** 开启tauri更新检测，包括创建密钥

**Date:** 2026-03-16
**Commit:** 5e4f61e

---

## Changes Made

### 1. Enabled Tauri updater runtime and config
- Added Rust dependency and plugin wiring:
  - `ui-react/src-tauri/Cargo.toml`
  - `ui-react/src-tauri/src/lib.rs`
- Enabled updater capability and build artifacts:
  - `ui-react/src-tauri/capabilities/default.json` adds `updater:default`
  - `ui-react/src-tauri/tauri.conf.json` sets `createUpdaterArtifacts: true`
  - Added updater config with endpoint and generated `pubkey`

### 2. Implemented real "Check Updates" behavior in Settings
- Installed frontend dependency `@tauri-apps/plugin-updater`.
- `ui-react/src/pages/Settings.tsx` now:
  - Runs `check()` from updater plugin in Tauri runtime
  - Shows checking/loading state on button
  - Shows toasts for checking, update available, up-to-date, and failures
  - Opens Releases page when update is found
- Added i18n keys in both locales:
  - `ui-react/src/i18n/messages/en.ts`
  - `ui-react/src/i18n/messages/zh.ts`

### 3. Added signing secrets wiring for release CI
- `.github/workflows/ci.yml` release step now reads:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### 4. Created updater key pair (local only)
- Generated private key: `ui-react/src-tauri/gen/updater/tauri-update.key`
- Generated public key: `ui-react/src-tauri/gen/updater/tauri-update.key.pub`
- Stored key password locally: `ui-react/src-tauri/gen/updater/.key-password`
- Note: `ui-react/src-tauri/gen/` is git-ignored; private key/password are not committed.

### 5. Synced release docs
- Updated `README.md` and `docs/build-path-contract.md` to remove outdated "updater disabled" policy and document signing-secret requirements.

---

## Verification

- `cargo check --manifest-path ui-react/src-tauri/Cargo.toml` -> passed
- `make test-typecheck` -> passed
  - frontend core tests: 31 passed
  - TypeScript typecheck: passed

---

## Files Modified

| File | Changes |
|------|---------|
| `.github/workflows/ci.yml` | Added updater signing secrets for release job |
| `README.md` | Documented updater artifacts and signer key setup |
| `docs/build-path-contract.md` | Updated CI updater policy/signing inputs |
| `ui-react/package.json` | Added `@tauri-apps/plugin-updater` dependency |
| `ui-react/package-lock.json` | Lockfile update for updater plugin |
| `ui-react/src-tauri/Cargo.toml` | Added `tauri-plugin-updater` |
| `ui-react/src-tauri/Cargo.lock` | Updated lockfile for updater dependencies |
| `ui-react/src-tauri/capabilities/default.json` | Added `updater:default` permission |
| `ui-react/src-tauri/src/lib.rs` | Registered updater plugin in Tauri builder |
| `ui-react/src-tauri/tauri.conf.json` | Enabled updater artifacts and updater config |
| `ui-react/src/i18n/messages/en.ts` | Added update-check related copy |
| `ui-react/src/i18n/messages/zh.ts` | Added update-check related copy |
| `ui-react/src/pages/Settings.tsx` | Implemented updater check logic and loading state |
