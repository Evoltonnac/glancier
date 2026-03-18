---
phase: quick
plan: 260318-eax
type: execute
wave: 1
depends_on: []
files_modified:
  - core/master_key_provider.py
  - core/settings_manager.py
  - core/secrets_controller.py
  - core/api.py
  - main.py
  - tests/core/test_master_key_provider.py
  - tests/api/test_settings_api.py
  - ui-react/src/api/client.ts
  - ui-react/src/pages/Settings.tsx
  - ui-react/src/i18n/messages/en.ts
  - ui-react/src/i18n/messages/zh.ts
autonomous: true
requirements: []
---

<objective>
Implement breaking change for encryption key handling: remove plaintext `master_key` from Settings/API/UI and migrate to keyring-only `MasterKeyProvider` with runtime cache and clear capability status.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Backend key management refactor to keyring-only provider</name>
  <files>core/master_key_provider.py, core/settings_manager.py, core/secrets_controller.py, main.py</files>
  <action>
Add `MasterKeyProvider` backed by Python keyring, remove `master_key` from `SystemSettings` persistence, inject provider into runtime at startup, and make secrets encryption path require provider (no plaintext fallback file).
  </action>
  <verify>
    <automated>python -m pytest tests/core/test_master_key_provider.py tests/core/test_settings_manager.py tests/core/test_app_startup_resilience.py -q</automated>
  </verify>
  <done>Runtime resolves master key only from keyring, caches in memory, and settings.json no longer stores plaintext master key.</done>
</task>

<task type="auto">
  <name>Task 2: Breaking API contract update for settings/encryption flow</name>
  <files>core/api.py, tests/api/test_settings_api.py</files>
  <action>
Remove `/api/settings/master-key/export` and `/api/settings/master-key/import`; keep `/api/settings` with runtime `encryption_available` status, enforce keyring availability before enabling encryption, and preserve full encrypt/decrypt migration on toggle.
  </action>
  <verify>
    <automated>python -m pytest tests/api/test_settings_api.py -q</automated>
  </verify>
  <done>API no longer exposes master key and returns explicit diagnostics when encryption cannot be enabled due to missing keyring backend.</done>
</task>

<task type="auto">
  <name>Task 3: Frontend settings UX cleanup and i18n sync</name>
  <files>ui-react/src/api/client.ts, ui-react/src/pages/Settings.tsx, ui-react/src/i18n/messages/en.ts, ui-react/src/i18n/messages/zh.ts, ui-react/tests/e2e/test_ui.spec.ts</files>
  <action>
Remove master-key import/export client methods and UI, keep only encryption toggle + available/unavailable status messaging, and sync translation keys in both EN/ZH.
  </action>
  <verify>
    <automated>make test-impacted</automated>
  </verify>
  <done>Settings page shows only local encryption control with keyring capability status and no master-key plaintext operations.</done>
</task>

</tasks>

<success_criteria>
- `settings.json` no longer stores `master_key`
- `/api/settings/master-key/export|import` are removed
- `/api/settings` response includes runtime `encryption_available`
- Enabling encryption fails with explicit error when system keyring backend is unavailable
- Secrets toggle migrations still work (plaintext -> ENC and ENC -> plaintext)
- Frontend Settings removes master-key import/export UI and keeps switch + status only
- Impacted backend/frontend/typecheck tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/260318-eax-breaking-change-remove-master-key-from-s/260318-eax-SUMMARY.md`
</output>
