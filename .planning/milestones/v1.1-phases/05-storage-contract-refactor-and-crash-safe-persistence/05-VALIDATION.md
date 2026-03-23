---
phase: 5
slug: storage-contract-refactor-and-crash-safe-persistence
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-20
---

# Phase 5 — Validation Strategy

Per-phase validation contract for storage contract migration, crash-safe writes, and deterministic diagnostics.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest` 9.x + Makefile verification wrappers |
| **Config file** | `pytest.ini` |
| **Quick run command** | `python -m pytest tests/core/test_storage_contract_sqlite.py tests/core/test_storage_crash_recovery.py tests/core/test_storage_startup_migration.py tests/core/test_storage_error_mapping.py tests/api/test_storage_error_codes_api.py -q` |
| **Full suite command** | `make test-backend` and `make test-impacted` |
| **Estimated runtime** | ~20-60 seconds (quick set), repository-dependent for full suite |

---

## Sampling Rate

- **After every task commit:** Run the requirement-targeted quick command subset for touched STOR IDs.
- **After every plan wave:** Run `make test-backend`.
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** <= 60 seconds for per-task feedback loops

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | STOR-01 | unit/integration | `python -m pytest tests/core/test_storage_contract_sqlite.py -q` | ✅ | ✅ green |
| 05-02-01 | 02 | 2 | STOR-02 | fault-injection integration | `python -m pytest tests/core/test_storage_crash_recovery.py -q` | ✅ | ✅ green |
| 05-03-01 | 03 | 3 | STOR-03 | startup migration integration | `python -m pytest tests/core/test_storage_startup_migration.py -q` | ✅ | ✅ green |
| 05-03-02 | 03 | 3 | STOR-04 | unit + API contract | `python -m pytest tests/core/test_storage_error_mapping.py tests/api/test_storage_error_codes_api.py -q` | ✅ | ✅ green |
| 05-03-03 | 03 | 3 | STOR-03, STOR-04 | phase gate quick aggregate | `python -m pytest tests/core/test_storage_startup_migration.py tests/core/test_storage_error_mapping.py tests/api/test_storage_error_codes_api.py -q` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/core/test_storage_contract_sqlite.py` — STOR-01 baseline schema/repository coverage
- [x] `tests/core/test_storage_crash_recovery.py` — STOR-02 rollback + last-known-good coverage
- [x] `tests/core/test_storage_startup_migration.py` — STOR-03 chunk migration + idempotency coverage
- [x] `tests/core/test_storage_error_mapping.py` — STOR-04 deterministic mapping helper coverage
- [x] `tests/api/test_storage_error_codes_api.py` — STOR-04 API `error_code` contract coverage

Existing infrastructure covers phase requirements; no additional framework bootstrapping required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQLite migration marker files are retained for operator rollback evidence (`*.deprecated.v1.json`) | STOR-03 | Requires real workspace file inspection after startup | Start backend against a workspace with legacy `data.json`/`sources.json`/`views.json`, then verify marker files exist and originals are absent. |
| Release gate reviewer validates all PASS/FAIL rows in `05-STORAGE-GATE.md` before cut | STOR-04 | Process checkpoint, not code path | Execute gate commands, capture outputs, and mark final release decision with timestamp. |

All other phase behaviors have automated verification.

---

## Gap Closure: Migration Key-Link

This section is mandatory for closing the Phase 5 key-link gap (`migration.py -> sqlite_*_repo.py`).

| Command | Expected Outcome |
|---------|------------------|
| `python -m pytest tests/core/test_storage_contract_sqlite.py tests/core/test_storage_startup_migration.py -q` | Exits `0`; migration/repository boundary regression tests pass. |
| `rg -n "upsert_migration_latest|upsert_migration_sources|upsert_migration_views" core/storage/migration.py` | Returns matches showing migration chunk writes call repository migration APIs. |
| `rg -n "INSERT INTO runtime_latest|INSERT INTO stored_sources|INSERT INTO stored_views|UPDATE stored_views SET payload_json" core/storage/migration.py` | Returns no matches; migrator embeds no direct runtime/resource mutation SQL. |

PASS criterion:
- All three commands above must satisfy their expected outcomes before Phase 5 can be marked `verified`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all previously missing references
- [x] No watch-mode flags
- [x] Feedback latency <= 60s for quick loops
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-20
