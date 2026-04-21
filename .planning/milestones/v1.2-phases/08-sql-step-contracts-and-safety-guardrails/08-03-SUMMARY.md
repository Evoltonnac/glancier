---
phase: 08-sql-step-contracts-and-safety-guardrails
plan: 03
subsystem: database
tags: [sql, settings, guardrails, docs, trust-gate]
requires:
  - phase: 08-sql-step-contracts-and-safety-guardrails
    provides: SQL runtime guardrail/error-code baseline from 08-02
provides:
  - System-level SQL timeout/max-row defaults persisted via `/api/settings` with backward-compatible normalization.
  - Flow documentation contract for `use: sql`, guardrail precedence, trust-gate behavior, and deterministic `runtime.sql_*` failures.
  - Prompt/Skill authoring policy aligned to read-first SQL guidance, trust-gated writes, and Mongo/GraphQL risk-evaluation parity artifact.
affects: [phase-09 connector parity planning, integration authoring guidance, SQL diagnostics/UAT]
tech-stack:
  added: []
  patterns: [sql guardrail precedence via settings->runtime resolution, concept-first SQL failure contract docs, trust-gated write-policy prompts]
key-files:
  created: [.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-CONNECTOR-RISK-EVAL.md]
  modified: [core/settings_manager.py, core/steps/sql_step.py, tests/core/test_settings_manager.py, tests/api/test_settings_api.py, tests/core/test_sql_step.py, docs/flow/02_step_reference.md, docs/flow/04_step_failure_test_inputs.md, docs/flow/05_refresh_scheduler_and_retry.md, skills/PROMPT.md, skills/integration-editor/SKILL.md, skills/integration-editor/references/flow-patterns.md]
key-decisions:
  - "Expose SQL guardrail defaults as stable system settings fields (`sql_default_timeout_seconds`, `sql_default_max_rows`) with strict normalization for legacy payloads."
  - "Treat resolved SQL step args as highest-precedence source override, then system defaults, then runtime built-ins for deterministic guardrail behavior."
  - "Keep AI authoring guidance read-first for SQL writes and explicitly route high-risk operations through trust authorization."
patterns-established:
  - "Settings-to-runtime Guardrail Contract: persistence fields and runtime fallback behavior must stay synchronized and regression-tested."
  - "Connector Risk Parity Pattern: classify unknown operation shapes as high risk and require authorization-wall trust fallback."
requirements-completed: [SQL-04, SQL-05, SQL-06]
duration: 11min
completed: 2026-03-24
---

# Phase 8 Plan 03: SQL Settings Contracts and Guardrail Policy Summary

**Shipped persisted SQL guardrail defaults with runtime precedence wiring, synchronized SQL flow/failure contracts, and trust-gated integration-authoring policy with Mongo/GraphQL risk-parity notes.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-24T08:24:55Z
- **Completed:** 2026-03-24T08:35:36Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Added SQL guardrail defaults to `SystemSettings` with backward-compatible normalization and `/api/settings` persistence coverage.
- Documented `use: sql` contract semantics, deterministic SQL failure-input matrix, and guardrail precedence across flow docs.
- Aligned integration-authoring prompt/skill guidance to read-first SQL policy with explicit trust-gate behavior and connector risk-evaluation artifact.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend settings model and API persistence for SQL guardrail defaults**
- `62620ca` (test) RED tests for SQL guardrail defaults and settings API round-trip
- `0053c59` (feat) settings fields + normalization implementation

2. **Task 2: Document SQL step contract, guardrail precedence, trust-gate behavior, and failure-input scenarios**
- `6027e3c` (docs) SQL flow/failure/retry contract updates

3. **Task 3: Sync Prompt/Skill policy and add Mongo/GraphQL risk-evaluation artifact**
- `1f55cb6` (docs) prompt/skill/risk-eval synchronization

Additional correctness commit during execution:
- `72fc96c` (fix) runtime uses SQL settings defaults with args-first precedence

## Files Created/Modified
- `core/settings_manager.py` - Added SQL guardrail settings fields and legacy normalization logic.
- `tests/core/test_settings_manager.py` - Added SQL guardrail default/compatibility assertions.
- `tests/api/test_settings_api.py` - Added settings API round-trip coverage for SQL guardrail fields.
- `core/steps/sql_step.py` - Resolved guardrail defaults from settings manager with args override precedence.
- `tests/core/test_sql_step.py` - Added precedence regression tests for SQL guardrail defaults.
- `docs/flow/02_step_reference.md` - Added `use: sql` step contract, trust-gate semantics, and runtime failure taxonomy.
- `docs/flow/04_step_failure_test_inputs.md` - Added deterministic SQL failure-input matrix and precedence reminder.
- `docs/flow/05_refresh_scheduler_and_retry.md` - Added SQL guardrail runtime contract and retry-policy note.
- `skills/PROMPT.md` - Added SQL step authoring guidance with SQLGlot/trust-wall expectations.
- `skills/integration-editor/SKILL.md` - Added explicit SQLGlot AST and authorization-wall guidance for writes.
- `skills/integration-editor/references/flow-patterns.md` - Added SQL step enumeration and trust-gated high-risk policy notes.
- `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-CONNECTOR-RISK-EVAL.md` - Recorded Mongo/GraphQL risk classes and fallback trust protocol.

## Decisions Made
- Persist SQL timeout/max-row defaults at system-settings boundary to keep API/runtime behavior deterministic for operators.
- Keep precedence explicit and test-backed: source/step args override system defaults, which override runtime built-ins.
- For connector-parity planning, classify unresolved parser states as high risk and force trust checks by default.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wired SQL runtime to consume persisted SQL guardrail defaults**
- **Found during:** Task 2 (docs consistency pass)
- **Issue:** SQL defaults were persisted in settings but runtime still used hardcoded values when args were omitted.
- **Fix:** Added settings-backed default resolver in SQL runtime and regression tests for precedence behavior.
- **Files modified:** `core/steps/sql_step.py`, `tests/core/test_sql_step.py`
- **Verification:** `python -m pytest tests/core/test_sql_step.py tests/core/test_settings_manager.py tests/api/test_settings_api.py -q` (31 passed)
- **Committed in:** `72fc96c`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Necessary correctness fix to match plan contract; no architectural scope expansion.

## Issues Encountered

- Initial `git commit` hit a transient `.git/index.lock`; retry succeeded after lock cleared.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 contracts now align across runtime behavior, settings persistence, docs, and authoring guidance.
- Connector-parity implementation can proceed in Phase 9 using the risk-evaluation artifact as baseline.

## Auth Gates

None.

## Self-Check: PASSED

- Verified required files exist:
  - `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-03-SUMMARY.md`
  - `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-CONNECTOR-RISK-EVAL.md`
  - `core/settings_manager.py`
  - `docs/flow/02_step_reference.md`
- Verified task commits exist:
  - `62620ca`
  - `0053c59`
  - `72fc96c`
  - `6027e3c`
  - `1f55cb6`

---
*Phase: 08-sql-step-contracts-and-safety-guardrails*  
*Completed: 2026-03-24*
