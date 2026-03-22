# Phase 5: Storage Contract Refactor and Crash-Safe Persistence - Research

**Researched:** 2026-03-20  
**Domain:** Local persistence architecture (SQLite + JSON bridge), crash-safe writes, startup migration, deterministic diagnostics  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### 1. Persistence Boundary by Entity
- Integration definitions remain file-based YAML (no storage backend change for integration files in this phase).
- Runtime Integration Data (`data`) migrates from `data/data.json` to SQLite.
- Resource entities (`sources`, `views`) migrate from `data/sources.json` and `data/views.json` to SQLite.
- Scraper task queue becomes memory-only runtime state (no durable queue persistence file); operational visibility can be handled by logs.
- System settings remain `data/settings.json` in this phase.
- Secrets remain in `data/secrets.json` in this phase (not migrated to SQLite yet).

### 2. Migration and Compatibility Policy
- Startup migration must automatically import existing JSON records (`data.json`, `sources.json`, `views.json`) into SQLite with no manual user steps.
- Migration executes in file-level chunks (`data.json` / `sources.json` / `views.json`) instead of one all-or-nothing monolithic pass.
- After each file chunk import, migration script must run immediate validation before proceeding to the next chunk.
- Migration must be idempotent: repeated startup should not duplicate or corrupt records.
- Post-migration read/write path for migrated entities is SQLite-only (no long-term dual-write mode).
- When a file chunk passes validation, the source JSON file should be renamed with a Deprecated marker (not deleted) to avoid repeated migration and preserve rollback evidence.
- Startup migrator should treat Deprecated-marked JSON files as already processed and skip re-import by default.

### 3. Crash-Safe Write and Recovery Semantics
- SQLite writes for migrated entities must be transaction-based so interrupted writes never expose partial state.
- Last known-good state must remain readable after abnormal termination.
- Deterministic failure surfaces must be preserved via stable `error_code` semantics (no generic-only failures).
- Recovery behavior must prioritize correctness and reproducibility over silent fallback.

### 4. Secrets Strategy and Encryption-Toggle Latency
- Secrets stay on current JSON + field-level encryption flow for Phase 5 and are explicitly out of migration scope in this phase.
- Encryption toggle behavior remains full-data migration for secrets (existing product contract).
- No additional toggle-latency observation work is required in this phase.
- Rationale: under current toggle semantics, switching storage medium to SQLite does not remove full-data rewrite complexity; it mainly increases refactor blast radius for auth/security paths.

### Claude's Discretion
- Exact SQLite schema shape and table/column naming for runtime/resources records.
- SQLite durability configuration choices (for example WAL/checkpoint strategy) as long as crash-safety decisions above are met.
- Exact Deprecated rename convention and retention lifecycle for migrated JSON source files.
- Log field structure for scraper task observability.

### Deferred Ideas (OUT OF SCOPE)
- Moving `secrets` from JSON to SQLite (with dedicated security-phase scope and explicit contract decisions) is deferred to a later phase.
- Additional storage scope expansion (for example history retention policy redesign or telemetry store) is deferred to future phases.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STOR-01 | User can persist runtime/resources/settings data through a unified storage contract with explicit schema versioning. | Storage contract abstraction, explicit repository interface, SQLite `user_version`, and schema migration table. |
| STOR-02 | User can recover from interrupted writes without corrupting local Integration Data or losing last known-good state. | Transaction-only writes (`BEGIN IMMEDIATE` + commit/rollback), WAL mode, startup integrity check, deterministic recovery branch. |
| STOR-03 | User can migrate existing `data/*.json` records into the refactored storage format automatically at startup. | Chunked startup migrator per file, idempotent UPSERT strategy, per-chunk validation, deprecated-file rename markers. |
| STOR-04 | User can rely on deterministic storage `error_code` diagnostics and repeatable verification checks before release. | Storage error taxonomy, API `error_code` mapping contract, requirement-to-test matrix and release gate commands. |
</phase_requirements>

## Summary

Phase 5 should be planned as a storage-contract refactor, not a blanket persistence rewrite. Existing managers (`DataController`, `ResourceManager`, `SettingsManager`, `SecretsController`) must be hidden behind a unified storage facade so runtime/resources move to SQLite while settings/secrets remain JSON by locked decision. This keeps blast radius low while still delivering explicit schema versioning and deterministic migration.

For crash safety, rely on SQLite transactional semantics instead of custom journaling. Use write transactions for every state mutation, enforce schema version via `PRAGMA user_version`, and run explicit startup checks (`quick_check`/`integrity_check` + migration ledger verification). Recovery should fail loud with stable `error_code` values and preserve last known-good rows.

Current code already has good seams: startup wiring in `main.py`, persistence managers in `core/data_controller.py` and `core/resource_manager.py`, and deterministic runtime `error_code` surfaces in `core/api.py`/`core/executor.py`. Planning should center on replacing storage internals while preserving these contracts.

**Primary recommendation:** implement a `StorageContract` + SQLite repositories with chunked idempotent migrator, transaction-guarded writes, and a fixed storage error taxonomy wired to existing API error envelopes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sqlite3` (Python stdlib) | Runtime `3.43.2` in this repo environment | Unified durable store for runtime/resources | ACID transactions, built-in schema versioning (`user_version`), no dependency churn |
| `pydantic` | Runtime `2.12.5` | Validation at storage boundary DTO level | Existing project standard for strict model validation |
| `fastapi` | Runtime `0.128.8` | Deterministic `error_code` diagnostics at API boundary | Existing API contract surface already consumed by UI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pytest` | Runtime `9.0.2` | Regression and migration verification | All storage contract and crash-recovery tests |
| `os`/`pathlib` stdlib | Python 3.10+ | Deprecated-file rename markers and atomic file replacement semantics | Migration marker lifecycle and JSON-side compatibility paths |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite for runtime/resources | Keep JSON/TinyDB writes | Fails STOR-02 durability/recovery expectations under interrupted writes |
| `PRAGMA user_version` + migration table | Ad-hoc `schema_version` JSON field | Easier to drift and harder to enforce per-transaction guarantees |
| Short transition bridge (SQLite-only post-migration) | Long-term dual write JSON + SQLite | High inconsistency risk and larger test matrix |

**Installation:**
```bash
# No new dependencies required for Phase 5.
# Use Python stdlib sqlite3 and existing project stack.
```

**Version verification:**
```bash
python - <<'PY'
import sqlite3, fastapi, pydantic, pytest
print(sqlite3.sqlite_version, fastapi.__version__, pydantic.__version__, pytest.__version__)
PY
```
Registry publish-date verification via `pip index` was blocked by sandbox network proxy in this session; runtime-installed versions above are verified locally.

## Architecture Patterns

### Recommended Project Structure
```text
core/
├── storage/
│   ├── contract.py              # Unified storage interface (runtime/resources/settings facade)
│   ├── sqlite_runtime_repo.py   # runtime latest/history + retry metadata
│   ├── sqlite_resource_repo.py  # sources/views persistence
│   ├── migration.py             # startup chunked migrator + ledger
│   └── errors.py                # storage error taxonomy -> stable error_code mapping
├── data_controller.py           # thin adapter to storage contract
├── resource_manager.py          # thin adapter to storage contract
└── settings_manager.py          # stays JSON in phase 5 (contract adapter only)
```

### Pattern 1: Versioned Contract at Repository Boundary
**What:** Add a single backend-owned storage contract that routes entities to SQLite or JSON adapters while exposing one stable interface.
**When to use:** Any path currently calling `DataController`/`ResourceManager` directly (`core/executor.py`, `core/api.py`, `main.py` wiring).
**Example:**
```python
# Source: project pattern + sqlite docs (PRAGMA user_version)
class StorageContract(Protocol):
    def get_latest(self, source_id: str) -> dict[str, Any] | None: ...
    def upsert_latest(self, source_id: str, payload: dict[str, Any]) -> None: ...
    def save_source(self, source: StoredSource) -> StoredSource: ...
    def save_view(self, view: StoredView) -> StoredView: ...
    def load_settings(self) -> SystemSettings: ...

def ensure_schema(conn: sqlite3.Connection, expected: int) -> None:
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    if current < expected:
        run_migrations(conn, current, expected)
    elif current > expected:
        raise StorageContractError("storage.schema_too_new")
```

### Pattern 2: Transaction-Only Write Path
**What:** Every SQLite mutation executes inside an explicit write transaction and commits atomically.
**When to use:** Runtime state updates, source/view CRUD, migration chunk import.
**Example:**
```python
# Source: https://docs.python.org/3/library/sqlite3.html
def write_txn(conn: sqlite3.Connection, fn: Callable[[sqlite3.Connection], None]) -> None:
    try:
        conn.execute("BEGIN IMMEDIATE")
        fn(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```

### Pattern 3: Chunked Idempotent Startup Migration
**What:** Migrate `data.json`, `sources.json`, `views.json` as independent chunks with per-chunk validation and rename-to-deprecated marker only after success.
**When to use:** App startup before API/executor begin serving requests.
**Example:**
```python
# Source: locked phase policy + Python os docs
def migrate_sources_chunk(path: Path, conn: sqlite3.Connection) -> None:
    records = json.loads(path.read_text(encoding="utf-8"))
    with transaction(conn):
        for row in records:
            conn.execute(
                "INSERT INTO sources(id, payload_json) VALUES(?, ?) "
                "ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json",
                (row["id"], json.dumps(row, ensure_ascii=False)),
            )
        validate_sources_chunk(conn, len(records))
    os.replace(path, path.with_name(path.name + ".deprecated.v1"))
```

### Anti-Patterns to Avoid
- **Dual-write as steady state:** migrate once, then read/write migrated entities from SQLite only.
- **Implicit schema drift:** every schema change must bump migration step + `user_version`.
- **Swallowing storage exceptions:** always map to deterministic `error_code`, never generic-only failure text.
- **Process startup without migration lock:** concurrent startup can double-import without a migration lock/ledger row.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Crash-safe commits | Custom temp-file journaling in app code | SQLite transaction + WAL semantics | Already solved, battle-tested, fewer edge cases |
| Schema version control | Manual `version.json` sidecar | `PRAGMA user_version` + migration table | Native DB-level versioning and deterministic upgrade path |
| Data integrity validation | Custom record scanning only | `PRAGMA quick_check`/`integrity_check` + targeted row-count validation | Detects low-level corruption plus logical migration mismatches |
| Migration replay prevention | Ad-hoc file existence checks only | Migration ledger table + deprecated filename marker | Prevents duplicate import under retries/restarts |

**Key insight:** Phase 5 should leverage SQLite primitives for durability and consistency; custom persistence mechanisms increase failure modes and verification burden.

## Common Pitfalls

### Pitfall 1: Foreign keys not enforced on every connection
**What goes wrong:** Source/view referential cleanup can drift and orphan rows remain.
**Why it happens:** SQLite requires `PRAGMA foreign_keys=ON` per connection.
**How to avoid:** Enable PRAGMAs centrally in connection factory and assert at startup.
**Warning signs:** Source delete succeeds but view bindings still reference deleted sources.

### Pitfall 2: WAL growth without checkpoint policy
**What goes wrong:** WAL file grows, startup checks slow down, and disk pressure increases.
**Why it happens:** WAL checkpoints are policy-driven and can stall under long readers.
**How to avoid:** Set deterministic checkpoint mode and add startup/release verification around checkpoint state.
**Warning signs:** `.db-wal` file keeps growing across normal operation.

### Pitfall 3: Non-idempotent migration UPSERT logic
**What goes wrong:** Restart during migration duplicates or overwrites data unpredictably.
**Why it happens:** Plain INSERT without conflict handling and missing migration ledger.
**How to avoid:** Use deterministic primary keys + UPSERT + per-chunk commit + ledger row.
**Warning signs:** Row counts increase on each restart with unchanged source files.

### Pitfall 4: `error_code` drift during storage exception handling
**What goes wrong:** API responses become generic and regress PH3/PH4 deterministic diagnostics.
**Why it happens:** New storage layer raises raw exceptions without canonical mapping.
**How to avoid:** Centralize `StorageContractError(code=...)` mapping through `build_error_envelope`.
**Warning signs:** client receives mixed `detail` text with missing stable codes.

## Code Examples

Verified patterns from official sources and current project contracts:

### SQLite Connection Factory for Phase 5
```python
# Source: sqlite PRAGMA docs + current project architecture
def connect_storage(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn
```

### Deterministic Storage Error Mapping
```python
# Source: core/error_formatter.py contract
def map_storage_error(exc: Exception) -> ErrorEnvelope:
    if isinstance(exc, sqlite3.IntegrityError):
        return build_error_envelope(
            code="storage.integrity_violation",
            summary="Storage integrity violation",
            details=str(exc),
        )
    if isinstance(exc, sqlite3.OperationalError):
        return build_error_envelope(
            code="storage.write_failed",
            summary="Storage write failed",
            details=str(exc),
        )
    return build_error_envelope(
        code="storage.unexpected_error",
        summary="Unexpected storage error",
        details=str(exc),
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON files per entity (`data.json`, `sources.json`, `views.json`) | SQLite repositories for runtime/resources, JSON retained for settings/secrets | Planned in Phase 5 (2026-03-20) | Stronger crash safety and explicit schema evolution |
| Best-effort file overwrite writes | Transaction-guarded write path + rollback semantics | Planned in Phase 5 | Prevents partial-state exposure after interrupted writes |
| Legacy TinyDB-shape normalization at read-time | Structured migration pipeline with explicit chunk validation | Planned in Phase 5 | Deterministic startup behavior and repeatable upgrade checks |

**Deprecated/outdated:**
- Direct persistence writes in `DataController`/`ResourceManager` without contract abstraction.
- Durable scraper queue file (`scraper_tasks.json`) for this phase scope.

## Open Questions

1. **Exact SQLite table shape for `latest_by_source` and `history_by_source`**
   - What we know: existing runtime contract fields include `status`, `message`, `interaction`, `error`, `error_code`, timestamps, and retry metadata.
   - What's unclear: split normalized columns vs JSON payload blobs.
   - Recommendation: store key query fields as columns (`source_id`, `status`, `error_code`, timestamps) and complex structures (`interaction`, `data`) as JSON text.

2. **Deprecated file retention lifecycle**
   - What we know: files must be renamed, not deleted, after successful chunk migration.
   - What's unclear: retention window and cleanup owner.
   - Recommendation: keep files until at least one full release cycle; add explicit cleanup command in a later phase.

3. **Settings participation in “unified contract” messaging**
   - What we know: settings must remain JSON in Phase 5 by locked decision.
   - What's unclear: how to phrase “unified” without implying single physical backend.
   - Recommendation: define unified as “single API/storage contract abstraction,” not “single storage engine.”

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest` 9.0.2 (backend), `vitest` 4.x (frontend contract consumers) |
| Config file | `pytest.ini`, `ui-react/vitest.config.ts` |
| Quick run command | `python -m pytest tests/core/test_data_controller.py tests/api/test_source_delete_api.py tests/api/test_source_auto_refresh_api.py -q` |
| Full suite command | `make test-impacted` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-01 | Unified storage contract with explicit schema versioning for runtime/resources/settings facade | unit/integration | `python -m pytest tests/core/test_storage_contract_sqlite.py -q` | ❌ Wave 0 |
| STOR-02 | Interrupted writes keep last known-good state readable | unit/fault-injection | `python -m pytest tests/core/test_storage_crash_recovery.py -q` | ❌ Wave 0 |
| STOR-03 | Startup migration imports JSON chunks idempotently with validation and deprecated rename markers | integration | `python -m pytest tests/core/test_storage_startup_migration.py -q` | ❌ Wave 0 |
| STOR-04 | Deterministic storage `error_code` surfaces and repeatable verification checks | API/unit | `python -m pytest tests/api/test_storage_error_codes_api.py tests/core/test_storage_error_mapping.py -q` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `python -m pytest tests/core/test_storage_contract_sqlite.py -q` (or touched-storage subset)
- **Per wave merge:** `make test-impacted`
- **Phase gate:** `make test-backend && make test-impacted`

### Wave 0 Gaps
- [ ] `tests/core/test_storage_contract_sqlite.py` — schema version, repository CRUD parity for runtime/resources.
- [ ] `tests/core/test_storage_crash_recovery.py` — rollback behavior under simulated mid-transaction failure.
- [ ] `tests/core/test_storage_startup_migration.py` — chunked idempotent migration + deprecated-file rename semantics.
- [ ] `tests/api/test_storage_error_codes_api.py` — deterministic API-level `error_code` verification for storage failures.
- [ ] `tests/core/test_storage_error_mapping.py` — centralized storage exception taxonomy mapping.

## Sources

### Primary (HIGH confidence)
- Project code and tests (local): `core/data_controller.py`, `core/resource_manager.py`, `core/settings_manager.py`, `core/scraper_task_store.py`, `core/api.py`, `core/executor.py`, `core/error_formatter.py`, `main.py`, `tests/core/test_data_controller.py`, `tests/api/test_source_delete_api.py`, `tests/api/test_source_auto_refresh_api.py`, `tests/core/test_scraper_task_store.py`
- SQLite PRAGMA reference (`user_version`, `foreign_keys`, `busy_timeout`, `wal_checkpoint`, `quick_check`, `integrity_check`): https://www.sqlite.org/pragma.html
- SQLite transaction semantics (`BEGIN IMMEDIATE`, read/write behavior): https://www.sqlite.org/lang_transaction.html
- SQLite WAL behavior and checkpoint defaults: https://sqlite.org/wal.html
- SQLite atomic commit background: https://www.sqlite.org/atomiccommit.html
- Python `sqlite3` transaction control and context manager semantics: https://docs.python.org/3/library/sqlite3.html
- Python atomic rename guidance (`os.replace`/rename atomicity semantics on POSIX): https://docs.python.org/3.12/library/os.html

### Secondary (MEDIUM confidence)
- None needed; primary sources are sufficient for the recommended architecture.

### Tertiary (LOW confidence)
- Runtime package version checks from local environment only (no registry publish-date confirmation due sandbox network proxy limitations for `pip index`).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - no new dependency assumptions; recommendations align with current repo/runtime.
- Architecture: **HIGH** - directly grounded in locked context decisions plus official SQLite/Python docs.
- Pitfalls: **HIGH** - mapped to observed code paths and known SQLite operational behaviors.

**Research date:** 2026-03-20  
**Valid until:** 2026-04-19 (30 days; stable backend/storage domain)
