# Quick Task 260318-eax Summary

**Description:** Breaking change: remove master_key from settings API/storage, use keyring-only MasterKeyProvider with backend+frontend+tests updates

**Date:** 2026-03-18
**Commit:** c283103

---

## Changes Made

### 1. Keyring-only master key provider
- Added `core/master_key_provider.py` with:
  - keyring-only `get_or_create_master_key()`
  - process-level cache to avoid repeated keyring reads/prompts
  - `is_encryption_available()` runtime capability status
  - explicit `MasterKeyUnavailableError`
- Added `is_keyring_backend_available()` in `core/encryption.py`.

### 2. Settings model and persistence breaking change
- Removed `master_key` from `SystemSettings` in `core/settings_manager.py`.
- `settings.json` now persists only non-secret business settings.
- Added legacy cleanup: when old settings contain `master_key`, it is stripped on load/save normalization.

### 3. Secrets controller dependency switch
- `core/secrets_controller.py` now resolves keys from `MasterKeyProvider` (not settings).
- Added `inject_master_key_provider(...)`.
- Encryption path now requires a key when encryption is enabled; no plaintext fallback on keyring failure.
- Full encrypt/decrypt migrations now require provider key and fail explicitly when unavailable.

### 4. API breaking changes and toggle behavior
- Removed endpoints:
  - `GET /api/settings/master-key/export`
  - `POST /api/settings/master-key/import`
- Updated `/api/settings` response to include runtime `encryption_available`.
- Updated `PUT /api/settings`:
  - enabling encryption now validates/provisions key via provider
  - if keyring backend unavailable, returns clear `400` error
  - keeps full migration behavior when toggling encryption on/off

### 5. App wiring and startup behavior
- `main.py` now creates and injects `MasterKeyProvider` into runtime.
- Startup preloads/provisions key once when encryption is enabled to avoid repeated runtime keyring prompts.

### 6. Frontend settings breaking updates
- Removed master-key import/export client APIs and UI flows.
- Settings page now keeps only:
  - local encryption switch
  - capability status (enabled/disabled/unavailable)
- Updated i18n keys in both `en.ts` and `zh.ts`.

### 7. Tests
- Added backend tests:
  - `tests/core/test_master_key_provider.py`
  - `tests/api/test_settings_api.py`
- Updated existing affected tests:
  - `tests/core/test_settings_manager.py`
  - `tests/core/test_encryption.py`
  - `tests/core/test_app_startup_resilience.py`
  - `ui-react/tests/e2e/test_ui.spec.ts`

---

## Verification

- `make test-impacted` -> passed
  - Python impacted suite: `31 passed`
  - Frontend core tests: `31 passed`
  - Typecheck: passed (`tsc --noEmit`)
- `python -m pytest tests/core/test_master_key_provider.py tests/api/test_settings_api.py -q` -> passed (`8 passed`)

---

## Files Modified

| File | Changes |
|------|---------|
| `core/master_key_provider.py` | Added keyring-only provider + cache + availability/error handling |
| `core/encryption.py` | Added keyring backend availability helper |
| `core/settings_manager.py` | Removed `master_key` from settings persistence and normalized legacy cleanup |
| `core/secrets_controller.py` | Switched key dependency to provider; removed fallback behavior |
| `core/api.py` | Removed master-key endpoints; added `encryption_available`; enforced keyring on enable |
| `main.py` | Wired provider creation/injection and startup preload |
| `ui-react/src/api/client.ts` | Removed master-key APIs; updated settings types |
| `ui-react/src/pages/Settings.tsx` | Removed import/export UI; retained toggle + status |
| `ui-react/src/i18n/messages/en.ts` | Updated encryption status copy |
| `ui-react/src/i18n/messages/zh.ts` | Updated encryption status copy |
| `tests/api/test_settings_api.py` | Added settings API regression coverage |
| `tests/core/test_master_key_provider.py` | Added provider behavior tests |
| `tests/core/test_settings_manager.py` | Updated settings persistence tests |
| `tests/core/test_encryption.py` | Added availability helper tests |
| `tests/core/test_app_startup_resilience.py` | Updated startup key preload tests |
| `ui-react/tests/e2e/test_ui.spec.ts` | Updated mocked settings payload |
