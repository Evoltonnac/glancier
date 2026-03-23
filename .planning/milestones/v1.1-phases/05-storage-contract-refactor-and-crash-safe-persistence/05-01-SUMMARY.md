---
phase: 05-storage-contract-refactor-and-crash-safe-persistence
plan: 01
subsystem: database
tags: [sqlite, storage-contract, fastapi, settings-json]
requires:
  - phase: 04-webview-stability-and-deterministic-recovery-baseline
    provides: deterministic runtime error/state contracts preserved during storage migration
provides:
  - unified backend storage contract with explicit schema version
  - sqlite runtime/resource repositories used by controller managers
  - shared app bootstrap wiring for runtime/resources/settings storage boundary
affects: [api, scheduler, bootstrap, persistence]
tech-stack:
  added: [sqlite3-stdlib]
  patterns: [storage-contract-delegation, shared-storage-bootstrap, settings-json-adapter]
key-files:
  created:
    - core/storage/contract.py
    - core/storage/sqlite_connection.py
    - core/storage/sqlite_runtime_repo.py
    - core/storage/sqlite_resource_repo.py
    - core/storage/settings_adapter.py
  modified:
    - core/data_controller.py
    - core/resource_manager.py
    - main.py
    - tests/core/test_storage_contract_sqlite.py
    - tests/core/test_data_controller.py
    - .gitignore
key-decisions:
  - "Kept settings and secrets JSON-backed while exposing settings through a StorageContract settings adapter."
  - "Used a single sqlite connection and shared StorageContract instance in create_app for runtime/resources parity."
patterns-established:
  - "Controllers delegate persistence to repository interfaces, preserving existing public methods."
  - "Bootstrap owns storage construction and dependency injection; API/executor call contracts stay unchanged."
requirements-completed: [STOR-01]
duration: 14m
completed: 2026-03-20
---

# Phase 5 Plan 1: Storage Contract Foundation Summary

**Versioned sqlite storage contract now persists runtime and resource entities behind unchanged manager APIs while settings remain JSON-backed via adapter delegation.**

## Performance

- **Duration:** 14m
- **Started:** 2026-03-20T13:17:29Z
- **Completed:** 2026-03-20T13:31:32Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Added `core/storage` contract package with schema version constant and sqlite bootstrap pragmas/tables.
- Refactored `DataController` and `ResourceManager` to delegate to storage repositories without changing public method signatures.
- Updated `main.create_app()` to build one shared storage contract and wire settings via `SettingsAdapter` while preserving JSON settings/secrets managers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unified storage contract and schema-versioned SQLite repositories**
   - `a144219` (test): RED tests for schema + repository contracts
   - `ad96e71` (feat): storage contract, sqlite connection, runtime/resource repos, settings adapter
2. **Task 2: Refactor DataController and ResourceManager to delegate to storage contract**
   - `8f74030` (test): RED delegation tests for DataController and retry metadata contract
   - `01c3ce8` (feat): controller/manager delegation to RuntimeStore/ResourceStore
3. **Task 3: Wire unified storage in app bootstrap while preserving settings/secrets JSON boundaries**
   - `f538564` (test): RED bootstrap wiring test requiring shared storage injection
   - `0b89f1f` (feat): shared storage contract wiring in `main.create_app`

Additional execution commit:
- `f039c0c` (chore): ignore generated sqlite runtime artifacts

## Files Created/Modified
- `core/storage/contract.py` - storage protocol boundary + schema version constant.
- `core/storage/sqlite_connection.py` - sqlite connection factory, durability pragmas, schema bootstrap.
- `core/storage/sqlite_runtime_repo.py` - runtime latest/history persistence contract implementation.
- `core/storage/sqlite_resource_repo.py` - source/view CRUD + view-source cleanup persistence.
- `core/storage/settings_adapter.py` - settings delegation wrapper over `SettingsManager`.
- `core/data_controller.py` - runtime method delegation to injected `RuntimeStore`.
- `core/resource_manager.py` - source/view method delegation to injected `ResourceStore`.
- `main.py` - shared storage contract construction and bootstrap injection wiring.
- `tests/core/test_storage_contract_sqlite.py` - contract + bootstrap + settings adapter regression tests.
- `tests/core/test_data_controller.py` - delegation and retry metadata compatibility tests.
- `.gitignore` - sqlite runtime artifact ignore rules.

## Decisions Made
- Kept settings/secrets JSON behavior unchanged for scope control and compatibility with existing encryption/migration flows.
- Injected one `StorageContract` instance into both managers in bootstrap to avoid split repository instances.
- Preserved manager constructor compatibility (`db_path`, `data_dir`) while supporting explicit storage injection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated sqlite runtime artifacts polluted worktree**
- **Found during:** Post-task verification
- **Issue:** `data/storage.db`, `data/storage.db-shm`, and `data/storage.db-wal` were created during verification and left untracked.
- **Fix:** Added sqlite ignore patterns in `.gitignore` and removed generated runtime files.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` shows no sqlite artifact files.
- **Committed in:** `f039c0c`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; cleanup was required to keep repository state reproducible.

## Issues Encountered
- Transient `.git/index.lock` blocked one commit attempt; retried commit after lock cleared and continued execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Storage contract baseline (STOR-01) is in place for subsequent migration and crash-safety plans.
- Runtime/resource persistence now has a unified injection seam, reducing blast radius for remaining storage-phase work.

---
*Phase: 05-storage-contract-refactor-and-crash-safe-persistence*
*Completed: 2026-03-20*

## Self-Check: PASSED
- FOUND: `.planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-01-SUMMARY.md`
- FOUND commits: `a144219`, `ad96e71`, `8f74030`, `01c3ce8`, `f538564`, `0b89f1f`, `f039c0c`
