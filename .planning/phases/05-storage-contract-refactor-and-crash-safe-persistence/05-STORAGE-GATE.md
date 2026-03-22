# Phase 5 Storage Release Gate

**Phase:** `05-storage-contract-refactor-and-crash-safe-persistence`  
**Plan:** `05-03`  
**Status:** Ready for execution evidence

## Scope

This gate verifies release readiness for storage contract migration and deterministic diagnostics:

- STOR-01 unified storage contract behavior and schema initialization
- STOR-02 crash-safe write rollback and last-known-good state preservation
- STOR-03 startup chunk migration (`data.json`, `sources.json`, `views.json`) and deprecated marker lifecycle
- STOR-04 deterministic `storage.*` API diagnostics and repeatable verification commands

## Requirement Coverage

| Requirement | Evidence | Pass Condition | Fail Condition |
|-------------|----------|----------------|----------------|
| STOR-01 | `tests/core/test_storage_contract_sqlite.py` | Contract/schema tests exit 0 | Any schema/contract assertion fails |
| STOR-02 | `tests/core/test_storage_crash_recovery.py` | Fault-injection rollback tests exit 0 | Any rollback/integrity assertion fails |
| STOR-03 | `tests/core/test_storage_startup_migration.py` + marker file inspection | Startup migration tests exit 0 and deprecated markers are generated | Migration tests fail, duplicates appear, or markers are missing |
| STOR-04 | `tests/core/test_storage_error_mapping.py` + `tests/api/test_storage_error_codes_api.py` | `error_code` and status mapping assertions exit 0 | API returns generic-only storage failures or incorrect `error_code` |

## Commands

Run all commands from repository root.

| Command | Requirement Links | Status | Latest Result |
|---------|-------------------|--------|---------------|
| `python -m pytest tests/core/test_storage_contract_sqlite.py -q` | STOR-01 | ⬜ pending | Not yet executed for this gate run |
| `python -m pytest tests/core/test_storage_crash_recovery.py -q` | STOR-02 | ⬜ pending | Not yet executed for this gate run |
| `python -m pytest tests/core/test_storage_startup_migration.py -q` | STOR-03 | ⬜ pending | Not yet executed for this gate run |
| `python -m pytest tests/core/test_storage_error_mapping.py tests/api/test_storage_error_codes_api.py -q` | STOR-04 | ⬜ pending | Not yet executed for this gate run |
| `python -m pytest tests/core/test_storage_startup_migration.py tests/core/test_storage_error_mapping.py tests/api/test_storage_error_codes_api.py -q` | STOR-03, STOR-04 | ⬜ pending | Not yet executed for this gate run |
| `make test-backend` | STOR-01, STOR-02, STOR-03, STOR-04 | ⬜ pending | Not yet executed for this gate run |
| `make test-impacted` | STOR-03, STOR-04 | ⬜ pending | Not yet executed for this gate run |

## Evidence Capture

For each command row above, capture:

1. Command text
2. Exit code
3. Timestamp
4. One-line summary (`N passed`, or first failing test identifier)

For STOR-03 marker lifecycle, also capture:

1. Directory listing before startup (`data.json`, `sources.json`, `views.json` present)
2. Directory listing after startup (`*.deprecated.v1.json` present and legacy filenames absent)
3. Re-run startup and confirm no duplicate row growth in `runtime_latest`, `stored_sources`, `stored_views`

## Manual Verifications

| Check | Requirement Links | Status | Evidence |
|------|--------------------|--------|----------|
| Startup migration marker files are retained (renamed, not deleted) | STOR-03 | ⬜ pending | Workspace `data/` directory listing before/after startup |
| Storage diagnostic payload includes `error_code` and stable summary text for operators | STOR-04 | ⬜ pending | API response snippets from failing storage route tests |

## Gap Closure: Migration Key-Link

The following checks are required evidence for closing the migration abstraction gap from verification.

| Command | Expected Outcome | Status |
|---------|------------------|--------|
| `python -m pytest tests/core/test_storage_contract_sqlite.py tests/core/test_storage_startup_migration.py -q` | Exits `0`; migration/repository boundary tests pass together. | ⬜ pending |
| `rg -n "upsert_migration_latest|upsert_migration_sources|upsert_migration_views" core/storage/migration.py` | Returns matches confirming repository migration APIs are called by migrator writes. | ⬜ pending |
| `rg -n "INSERT INTO runtime_latest|INSERT INTO stored_sources|INSERT INTO stored_views|UPDATE stored_views SET payload_json" core/storage/migration.py` | Returns no matches, proving no direct runtime/resource mutation SQL in migrator. | ⬜ pending |

PASS criterion:
- This section must be fully PASS (`✅`) before Phase 5 can be marked `verified`.

## Release Decision

Decision rules:

- **PASS** when all command rows and manual checks are marked `✅ PASS`.
- **FAIL** when any required row is `❌ FAIL` or evidence is incomplete.

Current decision: **PENDING** (update after executing this gate)

Release checklist:

- [ ] STOR-01 command rows PASS
- [ ] STOR-02 command rows PASS
- [ ] STOR-03 command rows PASS + marker lifecycle evidence captured
- [ ] STOR-04 command rows PASS + deterministic diagnostics evidence captured
- [ ] `make test-backend` PASS
- [ ] `make test-impacted` PASS
- [ ] Final decision updated to PASS/FAIL with timestamp
