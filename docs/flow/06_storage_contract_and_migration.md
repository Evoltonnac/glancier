# Storage Contract and Startup Migration

## 1. Scope and Ownership

This document defines the storage boundary and startup migration lifecycle introduced in Phase 5.

Owner boundaries:
- Backend storage contract owns runtime/resource persistence and migration orchestration.
- `SettingsManager` and `SecretsController` remain JSON-backed in this phase.
- Frontend remains a consumer of API responses and `error_code` diagnostics.

Primary implementation paths:
- `core/storage/contract.py`
- `core/storage/sqlite_connection.py`
- `core/storage/sqlite_runtime_repo.py`
- `core/storage/sqlite_resource_repo.py`
- `core/storage/migration.py`
- `core/storage/errors.py`
- `core/api.py`

## 2. Storage Boundary (SQLite vs JSON)

Phase 5 split:
- SQLite-backed entities:
  - Runtime Integration Data (`runtime_latest`, `runtime_history`)
  - Stored Sources (`stored_sources`)
  - Stored Views (`stored_views`)
- JSON-backed entities (unchanged in this phase):
  - Settings (`data/settings.json`)
  - Secrets (`data/secrets.json`)

This preserves compatibility while moving high-churn runtime/resource entities to transactional storage.

## 3. Startup Migration Chunk Order

On `main.create_app()`, startup migration runs before API route initialization and before runtime services consume source/view data.

Chunk order is fixed:
1. `data.json`
2. `sources.json`
3. `views.json`

Each chunk follows this sequence:
1. Parse JSON payload.
2. Upsert into SQLite.
3. Validate required key presence and committed row counts.
4. Rename legacy JSON file to deprecated marker.

Missing files are treated as no-op.

## 4. Deprecated Marker Lifecycle

Deprecated marker naming convention:
- `data.json` -> `data.deprecated.v1.json`
- `sources.json` -> `sources.deprecated.v1.json`
- `views.json` -> `views.deprecated.v1.json`

Marker policy:
- Marker files are retained (not deleted) as rollback evidence.
- On later startups, marker presence causes chunk skip by default.
- Migration is idempotent across restarts; reruns do not duplicate SQLite rows.

## 5. Crash-Recovery Semantics

Crash-safety invariants:
- SQLite writes run inside explicit `BEGIN IMMEDIATE` transaction boundaries.
- Failed chunk import rolls back that chunk transaction.
- Last known-good committed state remains readable after interruption.
- Migration never silently falls back to stale JSON as runtime source of truth after successful migration.

Operational implication:
- If startup migration fails mid-sequence, previously completed chunks remain committed and marked deprecated.
- Unfinished chunks retain original filenames and are retried on next startup.

## 6. Deterministic Storage Error Contract

Storage errors are surfaced through stable `error_code` values:
- `storage.read_failed` -> HTTP 500
- `storage.write_failed` -> HTTP 500
- `storage.integrity_violation` -> HTTP 500
- `storage.schema_mismatch` -> HTTP 503

API response contract for storage failures includes:
- Top-level `error_code`
- Canonical summary text
- Structured `error` envelope (`code`, `summary`, `details`)

This deterministic contract supports operator troubleshooting and release gating.

## 7. Verification Commands

Quick checks:

```bash
python -m pytest tests/core/test_storage_startup_migration.py -q
python -m pytest tests/core/test_storage_error_mapping.py tests/api/test_storage_error_codes_api.py -q
```

Release gates:

```bash
make test-backend
make test-impacted
```

Use `.planning/phases/05-storage-contract-refactor-and-crash-safe-persistence/05-STORAGE-GATE.md` to record PASS/FAIL evidence.
