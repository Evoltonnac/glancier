# Phase 9: SQL Runtime and Integration Data Normalization - Research

**Researched:** 2026-03-24
**Domain:** SQL connector runtime parity and Integration Data normalization
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Carried-Forward Constraints from Phase 8
- Keep step contract name as `use: sql`; do not split into connector-specific step types.
- Keep SQLGlot-based risk classification and trust-gate behavior for high-risk SQL operations.
- Keep deterministic `runtime.sql_*` error-code surfaces and credential-safe redaction semantics.
- Keep SQL guardrail precedence contract: source args override -> system defaults -> runtime built-ins.

### Connector Parity Scope and Profile Contract
- Phase 9 connector scope is locked to `sqlite` and `postgresql` for v1.2 completion criteria.
- Connector selection remains `args.connector.profile` under one contract model.
- Unsupported profiles must fail deterministically (`runtime.sql_connect_failed`) instead of implicit fallback behavior.

### Credential Model and Runtime Ownership
- SQL credentials must remain secret-channel-backed and never be exposed through `outputs` or persisted public runtime payload fields.
- SQLite and PostgreSQL may use different credential fields, but both must normalize into one internal backend adapter contract.
- Backend owns connection lifecycle, execution, normalization, and error classification; frontend remains render-only.

### Normalized Integration Data Envelope
- Keep `sql_response` as the stable root output envelope for backward compatibility with existing mappings.
- Standardize normalized output to include:
  - `rows` (list of row objects)
  - `fields` (typed field metadata, ordered by query projection order)
  - `row_count`, `duration_ms`, `truncated`
  - SQL execution context metadata (`statement_count`, `statement_types`, `is_high_risk`, `risk_reasons`, guardrail metadata)
- Keep `columns` and `execution_ms` as compatibility aliases during the transition, derived from canonical normalized fields/metadata.

### SQL-Native Value Serialization Policy
- Preserve JSON-native scalar types directly (`string`, `number`, `boolean`, `null`).
- Serialize `decimal` values deterministically as strings (precision-safe) with explicit field type metadata.
- Serialize temporal values to deterministic ISO-8601 strings with explicit field type metadata (`date`, `time`, `datetime`) and a documented timezone policy.
- Serialize `bytes` deterministically as encoded strings with explicit encoding metadata so template/chart consumers can reason about non-text binary values.

### Template Channel Compatibility
- SQL outputs must remain consumable through existing template expression channels with no frontend business-logic migration.
- Runtime normalization must preserve deterministic field names and predictable path access so existing `outputs/context` mapping semantics remain stable.

### Claude's Discretion
- Internal PostgreSQL adapter shape (driver integration, pooling strategy, timeout plumbing) as long as contract outputs and error surfaces remain stable.
- Final metadata object layout details (flat fields vs nested sub-object) as long as canonical keys above remain available.
- Compatibility deprecation timing for `columns`/`execution_ms` aliases, provided transition behavior is documented and test-covered.

### Deferred Ideas (OUT OF SCOPE)
- Additional connector profiles beyond SQLite/PostgreSQL (for example MySQL) remain deferred after Phase 9 baseline completion.
- SQL chart widget rendering and mapping UX remain in Phase 10 scope.
- SQL preview workflows, localized diagnostics improvements, and dashboard filter-to-SQL param orchestration remain in Phase 11 scope.
- Mongo/GraphQL runtime classifier parity remains follow-up work beyond this phase boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SQL-03 | One SQL contract model supports at least SQLite + PostgreSQL profiles | Single `use: sql` profile-dispatch adapter pattern with deterministic unsupported-profile failure |
| DATA-01 | Normalized SQL Integration Data (`rows` + typed field metadata) stable across connectors | Canonical envelope (`rows`, `fields`, metadata) plus connector-specific type mapping to canonical field types |
| DATA-02 | Deterministic serialization for `decimal`, `datetime`, `null`, `bytes` | Explicit serializer policy (`Decimal -> string`, temporal -> ISO-8601 policy, bytes -> base64, null passthrough) before persistence |
| DATA-03 | Expose SQL execution metadata (`row_count`, `duration_ms`, truncation) | Canonical metadata contract + compatibility aliases (`execution_ms`) with test matrix |
| DATA-04 | SQL outputs remain usable through existing template expression channels | Preserve `sql_response` root and stable dotted paths for executor `outputs/context` mapping |
</phase_requirements>

## Summary

Phase 9 should extend the existing SQLite-only `core/steps/sql_step.py` runtime into a two-profile adapter (`sqlite`, `postgresql`) without changing the `use: sql` contract or frontend boundaries. The key implementation boundary is backend normalization: every connector result must be transformed into one canonical `sql_response` envelope before persistence/output mapping.

Current code already provides strong foundations: SQLGlot risk classification, trust gating, `runtime.sql_*` deterministic errors, guardrail precedence, and executor path mapping through `outputs/context`. The missing pieces are PostgreSQL execution path, typed `fields` metadata, deterministic serialization of non-JSON-native SQL values, and compatibility alias handling (`columns`, `execution_ms`) during transition.

**Primary recommendation:** Implement a connector adapter + normalization pipeline in backend (`raw row -> typed field map -> deterministic JSON-safe envelope`) and keep `sql_response` path compatibility unchanged.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sqlite3` (Python stdlib) | Python 3.10+ | Existing SQLite connector path | Already in runtime; zero dependency churn |
| `psycopg` (`psycopg[binary]`) | 3.3.3 (PyPI, 2026-02-18) | PostgreSQL connector path for Phase 9 parity | Official PostgreSQL driver, DB-API compliant, exposes type metadata and typed Python values |
| `sqlglot` | 30.0.3 latest on PyPI (existing project constraint is `>=25.0.0`) | Keep static SQL classification behavior from Phase 8 | Risk/trust contract already built on SQLGlot; preserve behavior, avoid parser split |
| Python `json`, `decimal`, `datetime`, `base64` | stdlib | Deterministic value serialization before runtime persistence | Existing storage uses `json.dumps()` with no custom serializer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `psycopg.types` metadata APIs | bundled with `psycopg` 3.3.3 | Map PostgreSQL type identifiers to canonical field metadata | Use when filling `fields[].db_type`/typed metadata for PostgreSQL columns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `psycopg` adapter in existing step runtime | SQLAlchemy | SQLAlchemy helps multi-dialect abstraction but adds larger dependency/surface than needed for locked SQLite+PostgreSQL scope |
| Thread-offloaded sync DB-API calls (existing pattern) | Native async driver stack | Async drivers can improve concurrency, but thread-offload keeps architecture aligned with current sqlite runtime and smaller Phase 9 change risk |

**Installation:**
```bash
pip install "psycopg[binary]>=3.3.3,<3.4"
```

**Version verification (run 2026-03-24):**
```bash
python - <<'PY'
import json, urllib.request
for pkg in ['psycopg','sqlglot']:
    with urllib.request.urlopen(f'https://pypi.org/pypi/{pkg}/json', timeout=15) as r:
        data=json.load(r)
    v=data['info']['version']
    t=data['releases'][v][0]['upload_time_iso_8601']
    print(pkg, v, t)
PY
```

## Architecture Patterns

### Recommended Project Structure
```
core/
├── steps/sql_step.py             # keep step contract + high-level orchestration
├── sql/
│   ├── contracts.py              # existing SQLGlot classifier (unchanged behavior)
│   ├── runtime_adapters.py       # NEW: sqlite/postgresql execution adapters
│   └── normalization.py          # NEW: row+field normalization and deterministic serialization
└── executor.py                   # unchanged dispatch contract; output mapping remains owner
```

### Pattern 1: Profile Dispatch Under One `use: sql`
**What:** Keep one step type, route execution by `args.connector.profile`.
**When to use:** Any SQL connector expansion while preserving existing contract.
**Example:**
```python
# Source: docs/flow/02_step_reference.md + current core/steps/sql_step.py contract
ADAPTERS = {
    "sqlite": run_sqlite_query,
    "postgresql": run_postgresql_query,
}

profile = normalize_profile(args)
adapter = ADAPTERS.get(profile)
if adapter is None:
    raise SqlConnectFailedError(..., code="runtime.sql_connect_failed", details=f"Unsupported SQL connector profile: {profile}")
```

### Pattern 2: Two-Stage Normalization Boundary
**What:** Execute query first, then normalize to canonical envelope in one place before returning `sql_response`.
**When to use:** Every connector, always.
**Example:**
```python
# Source: Python json docs + sqlite3/psycopg cursor metadata docs
def normalize_sql_result(raw_columns, raw_rows, execution_ctx):
    fields = build_typed_fields(raw_columns)
    rows = [serialize_row(row, fields) for row in raw_rows]
    return {
        "rows": rows,
        "fields": fields,
        "row_count": len(rows),
        "duration_ms": execution_ctx.duration_ms,
        "truncated": execution_ctx.truncated,
    }
```

### Pattern 3: Canonical + Alias Contract for Safe Transition
**What:** Write canonical keys and derive compatibility aliases from canonical values.
**When to use:** Transition from Phase 8 envelope (`columns`, `execution_ms`) to Phase 9 envelope (`fields`, `duration_ms`).
**Example:**
```python
# Source: Phase 9 context locked decisions
response["columns"] = [field["name"] for field in response["fields"]]
response["execution_ms"] = response["duration_ms"]
```

### Anti-Patterns to Avoid
- **Connector-specific output shapes:** Never return different envelope keys by profile.
- **Raw DB values persisted directly:** `json.dumps()` in runtime storage will fail or drift for `Decimal`/`datetime`/`bytes`.
- **Credential leakage through debug output mapping:** keep connection secrets in `secrets` channel only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PostgreSQL wire protocol | Custom socket/protocol client | `psycopg` | Driver already handles protocol, auth methods, and typed adaptation |
| SQL type inference by regex on values | Value-shape heuristics | Cursor metadata (`description`) + adapter type info | Value-only heuristics drift across connectors and null-heavy rows |
| Binary serialization format guessing | Ad-hoc hex/string conversion | Standard base64 encoding + metadata | Base64 is deterministic and safe for JSON/template transport |
| JSON fallback for unsupported objects | Silent `str(value)` coercion for everything | Explicit type policy per SQL-native type | Prevents hidden data-shape bugs and chart/template drift |

**Key insight:** Phase 9 risk is not query execution itself; it is cross-connector shape/type drift. Reuse stable driver/runtime primitives and centralize normalization logic.

## Common Pitfalls

### Pitfall 1: Non-JSON SQL values break persistence
**What goes wrong:** Runtime persistence fails (or drifts) when rows include `Decimal`, `datetime`, `bytes`, etc.
**Why it happens:** `core/storage/sqlite_runtime_repo.py` uses `json.dumps(record)` with no default serializer.
**How to avoid:** Serialize in SQL normalization layer before `DataController.upsert()`.
**Warning signs:** `TypeError: Object of type ... is not JSON serializable`.

### Pitfall 2: Type metadata inconsistency across connectors
**What goes wrong:** Same logical query yields incompatible `fields` metadata by connector.
**Why it happens:** SQLite metadata is sparse while PostgreSQL metadata is rich; unnormalized raw metadata leaks through.
**How to avoid:** Define canonical field taxonomy (`integer`, `float`, `decimal`, `string`, `boolean`, `date`, `time`, `datetime`, `bytes`, `unknown`) and map per connector.
**Warning signs:** Template/chart mappings work in one connector but fail in another.

### Pitfall 3: Temporal drift and timezone ambiguity
**What goes wrong:** `datetime` values render with shifted times or inconsistent formats.
**Why it happens:** mixed naive/aware datetime handling.
**How to avoid:** Document one deterministic policy: ISO-8601 output, UTC-normalized aware values, explicit metadata for timezone assumptions.
**Warning signs:** chart axis ordering/date buckets diverge between SQLite and PostgreSQL.

### Pitfall 4: Contract breakage for existing mappings
**What goes wrong:** Existing `outputs` paths break after introducing canonical fields.
**Why it happens:** removing/renaming `columns`/`execution_ms` too early.
**How to avoid:** keep aliases through Phase 9 and deprecate later with docs/tests.
**Warning signs:** regressions in `step.outputs` mappings that previously used `sql_response.columns` or `sql_response.execution_ms`.

## Code Examples

Verified patterns from official sources and current code contracts:

### Deterministic SQL Value Serializer
```python
# Source: https://docs.python.org/3/library/json.html
# Source: https://www.psycopg.org/psycopg3/docs/basic/adapt.html
from __future__ import annotations

from base64 import b64encode
from datetime import date, datetime, time, timezone
from decimal import Decimal


def serialize_sql_value(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc)
        return value.isoformat()
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, (bytes, bytearray)):
        return b64encode(bytes(value)).decode("ascii")
    return str(value)
```

### Canonical Envelope with Compatibility Aliases
```python
# Source: Phase 9 context locked output contract
def build_sql_response(rows, fields, duration_ms, truncated, statement_meta, guardrail_meta):
    return {
        "rows": rows,
        "fields": fields,
        "row_count": len(rows),
        "duration_ms": duration_ms,
        "truncated": truncated,
        "statement_count": statement_meta["statement_count"],
        "statement_types": statement_meta["statement_types"],
        "is_high_risk": statement_meta["is_high_risk"],
        "risk_reasons": statement_meta["risk_reasons"],
        "timeout_seconds": guardrail_meta["timeout_seconds"],
        "max_rows": guardrail_meta["max_rows"],
        # compatibility aliases
        "columns": [field["name"] for field in fields],
        "execution_ms": duration_ms,
    }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite-only execution path in `sql_step` | Multi-profile adapter (`sqlite` + `postgresql`) under one `use: sql` contract | Phase 9 | Meets SQL-03 without API/flow contract split |
| Output shape focused on `rows` + `columns` + `execution_ms` | Canonical normalized envelope with typed `fields` + `duration_ms` + `truncated` (+ aliases) | Phase 9 | Enables stable cross-connector chart/template consumption |
| Implicit raw SQL value pass-through | Explicit deterministic serialization policy per SQL-native type | Phase 9 | Prevents storage/type drift and runtime serialization failures |

**Deprecated/outdated (transition phase):**
- `sql_response.columns` as canonical schema descriptor: keep as alias only.
- `sql_response.execution_ms` as canonical timing field: keep as alias to `duration_ms`.

## Open Questions

1. **PostgreSQL credential schema shape in `args.credentials`**
   - What we know: must remain secret-channel-backed and profile-specific fields are allowed.
   - What's unclear: exact minimal required key set for v1.2 docs/examples (`dsn` only vs host/user/password/db split).
   - Recommendation: pick one canonical authoring path in docs/tests (prefer DSN for minimal surface), keep adapter accepting both if needed.

2. **Canonical `fields[].type` taxonomy naming**
   - What we know: typed field metadata is required and must be stable across connectors.
   - What's unclear: final enum naming and whether connector-native type names are exposed separately.
   - Recommendation: ship a small canonical enum plus optional `db_type` raw hint; never expose connector-only type names as primary contract.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest` + `pytest-asyncio` (strict mode) |
| Config file | `pytest.ini` |
| Quick run command | `python -m pytest tests/core/test_sql_contracts.py tests/core/test_sql_step.py -q` |
| Full suite command | `bash scripts/test_backend_core.sh --full` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SQL-03 | Same `use: sql` contract executes on `sqlite` and `postgresql` profiles | unit/integration | `python -m pytest tests/core/test_sql_step_connectors.py -q` | ❌ Wave 0 |
| DATA-01 | Canonical `rows` + typed `fields` stable across connectors | unit | `python -m pytest tests/core/test_sql_normalization_fields.py -q` | ❌ Wave 0 |
| DATA-02 | Deterministic serialization for `decimal`/`datetime`/`null`/`bytes` | unit | `python -m pytest tests/core/test_sql_value_serialization.py -q` | ❌ Wave 0 |
| DATA-03 | `row_count`, `duration_ms`, `truncated` deterministic and alias-safe | unit | `python -m pytest tests/core/test_sql_step.py -q -k \"duration_ms or truncated or execution_ms\"` | ✅ (expand existing file) |
| DATA-04 | Existing `outputs/context` expression channels can reference normalized SQL paths | integration | `python -m pytest tests/core/test_sql_output_channel_compat.py -q` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `python -m pytest tests/core/test_sql_contracts.py tests/core/test_sql_step.py -q`
- **Per wave merge:** `make test-backend`
- **Phase gate:** `make test-backend && make test-impacted`

### Wave 0 Gaps
- [ ] `tests/core/test_sql_step_connectors.py` — covers REQ-SQL-03
- [ ] `tests/core/test_sql_normalization_fields.py` — covers REQ-DATA-01
- [ ] `tests/core/test_sql_value_serialization.py` — covers REQ-DATA-02
- [ ] `tests/core/test_sql_output_channel_compat.py` — covers REQ-DATA-04
- [ ] Extend `tests/core/test_sql_step.py` for canonical metadata aliases and truncation contract — covers REQ-DATA-03

## Sources

### Primary (HIGH confidence)
- Current repository contracts/code:
  - `.planning/phases/09-sql-runtime-and-integration-data-normalization/09-CONTEXT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/ROADMAP.md`
  - `core/steps/sql_step.py`
  - `core/executor.py`
  - `core/config_loader.py`
  - `core/storage/sqlite_runtime_repo.py`
  - `tests/core/test_sql_step.py`
  - `tests/core/test_sql_contracts.py`
  - `docs/flow/01_architecture_and_orchestration.md`
  - `docs/flow/02_step_reference.md`
  - `docs/flow/04_step_failure_test_inputs.md`
  - `docs/flow/05_refresh_scheduler_and_retry.md`
  - `docs/sdui/03_template_expression_spec.md`
  - `docs/testing_tdd.md`
- Python sqlite3 docs (type mapping + cursor metadata): https://docs.python.org/3/library/sqlite3.html
- Python json docs (non-serializable fallback behavior): https://docs.python.org/3/library/json.html
- Psycopg adaptation docs (typed value adaptation semantics): https://www.psycopg.org/psycopg3/docs/basic/adapt.html
- Psycopg `Column` metadata docs: https://www.psycopg.org/psycopg3/docs/api/objects.html
- PostgreSQL datetime semantics: https://www.postgresql.org/docs/current/datatype-datetime.html
- PyPI JSON metadata:
  - https://pypi.org/pypi/psycopg/json
  - https://pypi.org/pypi/sqlglot/json

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package metadata verified on 2026-03-24 and aligns with existing runtime boundaries.
- Architecture: MEDIUM-HIGH - grounded in current code seams and locked context decisions; PostgreSQL credential-shape finalization still pending.
- Pitfalls: HIGH - directly supported by current storage/serialization behavior and existing SQL runtime tests.

**Research date:** 2026-03-24
**Valid until:** 2026-04-07 (re-check package versions before implementation if delayed)
