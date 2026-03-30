---
phase: 08-sql-step-contracts-and-safety-guardrails
plan: 01
subsystem: database
tags: [sql, sqlglot, schema, safety]
requires:
  - phase: 07-risk-operation-trust-authorization-rule-storage-and-http-step-refactor
    provides: trust-decision interaction and runtime error-code handling patterns reused by SQL contracts
provides:
  - First-class `use: sql` step contract in StepType and generated schema variants.
  - SQLGlot-based static SQL risk classification with deterministic metadata.
  - Regression tests for SQL schema generation and SQL contract safety semantics.
affects: [08-02 runtime sql step integration, 08-03 docs and authoring guidance, sql runtime policy]
tech-stack:
  added: [sqlglot]
  patterns: [colocated step args schema declarations, pure AST risk-classifier module]
key-files:
  created: [core/sql/__init__.py, core/sql/contracts.py, tests/core/test_sql_contracts.py]
  modified: [requirements.txt, core/config_loader.py, tests/test_generate_schemas.py, config/schemas/integration.python.schema.json, config/schemas/integration.schema.json]
key-decisions:
  - "SQL step args require connector profile, credential-reference map, and user-authored query text."
  - "Any non-query or multi-statement SQL is classified high-risk and marked `requires_trust` before runtime wiring."
patterns-established:
  - "Step Contract Sync: StepType additions must include STEP_ARGS_SCHEMAS_BY_USE entries and regenerated schema artifacts."
  - "SQL Contract Validation: parse final SQL text with SQLGlot and emit deterministic risk metadata or `runtime.sql_invalid_contract`."
requirements-completed: [SQL-01, SQL-02]
duration: 8min
completed: 2026-03-24
---

# Phase 8 Plan 01: SQL Contract Foundation Summary

**`use: sql` is now a schema-validated flow step with SQLGlot AST risk classification that deterministically flags high-risk SQL before runtime execution wiring.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-24T07:51:22Z
- **Completed:** 2026-03-24T07:59:06Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added `StepType.SQL` and colocated SQL args schema contract in `core/config_loader.py`.
- Regenerated Python/composed integration schemas to include `StepConfig_sql` variants.
- Added SQLGlot dependency declaration and implemented pure SQL contract classifier in `core/sql/contracts.py`.
- Added regression tests for SQL step schema coverage and SQL risk/invalid-query contract behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add `sql` step type and colocated schema declaration**
   - `22e2dd1` (test) RED tests for SQL step/schema/dependency expectations
   - `47526fd` (feat) SQL step schema + dependency + regenerated schema artifacts
2. **Task 2: Implement SQL contract safety validator module**
   - `bd45cc7` (test) RED tests for SQL AST contract semantics
   - `d9d62f3` (feat) SQLGlot-backed deterministic risk classifier implementation

## Files Created/Modified
- `core/sql/contracts.py` - SQL parser/validator that classifies risk and enforces deterministic invalid-contract errors.
- `core/sql/__init__.py` - SQL contract module exports for stable imports.
- `tests/core/test_sql_contracts.py` - Regression tests for safe/risky SQL classification and invalid SQL handling.
- `core/config_loader.py` - `StepType.SQL` and SQL args schema declaration in `STEP_ARGS_SCHEMAS_BY_USE`.
- `tests/test_generate_schemas.py` - Contract assertions for SQL step schema and SQLGlot dependency declaration.
- `config/schemas/integration.python.schema.json` - Regenerated schema with `StepConfig_sql`.
- `config/schemas/integration.schema.json` - Regenerated combined schema including SQL step variant.
- `requirements.txt` - Added `sqlglot` dependency declaration.

## Decisions Made
- Required SQL args contract fields are `connector`, `credentials`, and `query` to encode connector profile + secret-backed credential references + user-authored SQL text.
- Risk classification semantics are strict by default: any multi-statement query or non-query statement is flagged high-risk and marked `requires_trust=True`.
- Invalid or empty SQL text raises deterministic `runtime.sql_invalid_contract` through `SqlContractValidationError`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing local `sqlglot` package for test execution**
- **Found during:** Task 2 verification
- **Issue:** Runtime environment did not have `sqlglot` installed, causing `ModuleNotFoundError`.
- **Fix:** Installed `sqlglot` in the local environment (`python -m pip install sqlglot`) after adding it to `requirements.txt`.
- **Files modified:** None (environment-only fix)
- **Verification:** `python -m pytest tests/core/test_sql_contracts.py -q` passed.
- **Committed in:** N/A (non-repository environment action)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; fix was required only to execute planned verification in current environment.

## Issues Encountered
- Encountered transient git index lock conflicts when add/commit commands overlapped; resolved by running commit steps sequentially.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SQL contract and schema foundation is complete and verified.
- Phase `08-02` can now wire runtime `execute_sql_step` against `core/sql/contracts.py` risk metadata and trust-wall behavior.

## Self-Check: PASSED
- Verified required files exist:
  - `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-01-SUMMARY.md`
  - `core/sql/contracts.py`
  - `tests/core/test_sql_contracts.py`
  - `config/schemas/integration.python.schema.json`
- Verified required commits exist:
  - `22e2dd1`
  - `47526fd`
  - `bd45cc7`
  - `d9d62f3`

---
*Phase: 08-sql-step-contracts-and-safety-guardrails*
*Completed: 2026-03-24*
