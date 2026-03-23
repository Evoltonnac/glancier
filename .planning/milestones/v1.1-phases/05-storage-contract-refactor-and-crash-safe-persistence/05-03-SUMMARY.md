---
phase: 05-storage-contract-refactor-and-crash-safe-persistence
plan: 03
subsystem: database
tags: [sqlite, migration, error-codes, fastapi, validation-gate]
requires:
  - phase: 05-01
    provides: shared StorageContract wiring for runtime/resources/settings boundary
  - phase: 05-02
    provides: transaction-safe repositories and base storage error taxonomy
provides:
  - Startup chunk migration from legacy JSON files to SQLite with deprecated marker lifecycle
  - Deterministic API storage diagnostics with canonical storage.* error_code payloads
  - Phase 5 validation matrix, release gate checklist, and storage architecture flow documentation
affects: [api, storage, startup, release-gates, docs]
tech-stack:
  added: []
  patterns:
    [
      startup chunk migration with post-validation marker rename,
      centralized storage error->API envelope mapping,
      requirement-mapped release gate verification tables,
    ]
key-files:
  created:
    [
      core/storage/migration.py,
      tests/core/test_storage_startup_migration.py,
      tests/core/test_storage_error_mapping.py,
      tests/api/test_storage_error_codes_api.py,
      .planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-STORAGE-GATE.md,
      docs/flow/06_storage_contract_and_migration.md,
      .planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-03-SUMMARY.md,
    ]
  modified:
    [
      main.py,
      core/storage/errors.py,
      core/api.py,
      .planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-VALIDATION.md,
    ]
key-decisions:
  - "Startup migration runs in create_app before API/runtime initialization so migrated source/view/runtime records are available on first request."
  - "Storage failures are converted to stable API envelopes via one helper in core/storage/errors.py to keep error_code/status mapping deterministic."
  - "Phase 5 gate docs are requirement-indexed (STOR-01..STOR-04) to make PASS/FAIL evidence collection repeatable."
patterns-established:
  - "Legacy chunk processing order is fixed: data.json -> sources.json -> views.json."
  - "Only validated chunks are marked with .deprecated.v1.json lifecycle markers."
  - "Storage exception responses include top-level error_code and structured error envelope."
requirements-completed: [STOR-03, STOR-04]
duration: 12m
completed: 2026-03-20
---

# Phase 05 Plan 03: Storage Migration and Deterministic Diagnostics Summary

**Automatic startup migration now imports legacy data/sources/views JSON into SQLite with idempotent deprecated markers, while storage API failures return stable storage.* error_code diagnostics.**

## Performance

- **Duration:** 12m
- **Started:** 2026-03-20T13:57:07Z
- **Completed:** 2026-03-20T14:09:07Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Delivered startup chunk migrator (`data.json`, `sources.json`, `views.json`) with validation and `.deprecated.v1.json` marker lifecycle.
- Added deterministic storage error-code mapping helper and API route wrappers returning canonical storage diagnostic payloads.
- Replaced validation placeholders with executable Phase 5 command matrix and added release gate + flow docs for operators.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build startup chunk migrator with idempotent deprecated-marker workflow** - `379fa84` (`test`, RED) and `461ede5` (`feat`, GREEN)
2. **Task 2: Wire deterministic storage error_code diagnostics into API responses** - `bda0382` (`test`, RED) and `9b8634a` (`feat`, GREEN)
3. **Task 3: Finalize Phase 5 verification and architecture documentation** - `defef9f` (`docs`)

**Plan metadata:** Pending final docs/state commit in this execution.

_Note: TDD tasks include separate RED and GREEN commits._

## Files Created/Modified
- `core/storage/migration.py` - Implements startup chunk import, validation, and deprecated marker rename lifecycle.
- `main.py` - Calls startup migration before API initialization.
- `tests/core/test_storage_startup_migration.py` - Verifies chunk order, marker rename timing, and idempotent reruns.
- `core/storage/errors.py` - Adds canonical storage error->API response helper with fixed status mapping.
- `core/api.py` - Returns deterministic storage error envelopes for storage-dependent routes.
- `tests/core/test_storage_error_mapping.py` - Validates storage error mapping helper contract.
- `tests/api/test_storage_error_codes_api.py` - Validates API-level deterministic storage `error_code` responses.
- `.planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-VALIDATION.md` - Adds Nyquist-compliant Phase 5 verification matrix.
- `.planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-STORAGE-GATE.md` - Adds repeatable release gate checklist and evidence rules.
- `docs/flow/06_storage_contract_and_migration.md` - Documents storage boundaries, migration lifecycle, crash recovery, and diagnostics contract.

## Decisions Made
- Kept migration failure handling deterministic by surfacing `StorageContractError` (no silent continuation).
- Standardized storage API failures on canonical summaries and top-level `error_code` payload fields.
- Structured Phase 5 validation and release documentation around explicit STOR requirement traceability.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- STOR-03 and STOR-04 implementation and verification artifacts are complete.
- Phase 5 storage release gate can now be executed and signed with command evidence.

---
*Phase: 05-storage-contract-refactor-and-crash-safe-persistence*
*Completed: 2026-03-20*

## Self-Check: PASSED

- FOUND: `.planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-03-SUMMARY.md`
- FOUND commit: `379fa84`
- FOUND commit: `461ede5`
- FOUND commit: `bda0382`
- FOUND commit: `9b8634a`
- FOUND commit: `defef9f`
