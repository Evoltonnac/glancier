# Phase 8: SQL Step Contracts and Safety Guardrails - Research

**Researched:** 2026-03-24  
**Phase:** 8  
**Requirement IDs:** SQL-01, SQL-02, SQL-04, SQL-05, SQL-06  
**Primary Inputs:** `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `db_step_design.md`

## Objective

Define a minimal, testable implementation path that:
- introduces a first-class `use: sql` flow step contract
- enforces AST-based SQL risk classification over fully user-authored query text
- applies deterministic timeout/max-row guardrails with source override precedence
- emits stable SQL runtime error codes without credential leakage

## Scope Constraints

- SQL AST classification is implemented via SQLGlot in Phase 8 (explicitly approved direction).
- Backend remains owner of SQL execution policy, guardrails, and error semantics.
- Frontend contract should remain error-code-driven, with no new business state ownership.
- Keep output/contract evolution additive to avoid breaking existing non-SQL integrations.

## Current Gaps

1. No SQL step in `StepType` or step-args schema variants.
2. No SQL execution handler in `core/steps/` or executor branch wiring.
3. No shared SQL guardrail policy module for AST-based risk classification on final user-authored SQL text.
4. No SQL runtime error taxonomy integrated into existing formatter/state pipeline.
5. No SQL-specific timeout/max-row defaults or source-level override precedence contract.
6. Flow docs and failure-input docs do not yet define SQL step contract and failure semantics.

## Recommended Architecture

### A. SQL step contract and schema variants

Add `StepType.SQL = "sql"` and colocated args schema including:
- connector profile identity
- credential channel references (secret-backed)
- query text (fully user-authored)
- optional guardrail overrides (`timeout`, `max_rows`)

Validation goals:
- deterministic required fields
- disallow ambiguous contract shapes
- keep schema generation tests in lockstep (`scripts/generate_schemas.py`, `tests/test_generate_schemas.py`)

### B. Shared SQL safety and guardrail resolver (SQLGlot AST)

Introduce a focused SQL policy module for:
- SQLGlot AST classification for safe vs high-risk operations
- high-risk operation routing into existing authorization wall (allow_once/allow_always/deny)
- static risk checks on the final resolved SQL text prior to execution
- guardrail resolution precedence (source override > system settings > step defaults)

This module should be independent and unit-testable before full runtime expansion.

### C. SQL runtime execution baseline + deterministic error contract

Add `core/steps/sql_step.py` and executor wiring with deterministic failures for:
- connection/auth failures
- query execution failures
- guardrail timeout
- max-row truncation/limit-trigger semantics
- invalid SQL contract usage
- high-risk SQL trust-required/denied outcomes

Error-code policy should remain stable and explicit, for example:
- `runtime.sql_invalid_contract`
- `runtime.sql_risk_operation_requires_trust`
- `runtime.sql_risk_operation_denied`
- `runtime.sql_connect_failed`
- `runtime.sql_auth_failed`
- `runtime.sql_query_failed`
- `runtime.sql_timeout`
- `runtime.sql_row_limit_exceeded`

Credential leakage constraints:
- redact DSN/password/token-like fragments in logs and surfaced details
- avoid persisting raw credential-bearing payloads in runtime state

### D. Non-SQL connector parity evaluation (Mongo/GraphQL)

Phase 8 should include an evaluation artifact (not full runtime implementation) that:
- maps Mongo write-class operations to risk classes
- maps GraphQL mutation/subscription operations to risk classes
- defines a reusable fallback contract: risk classification -> authorization wall -> explicit decision

## Sequencing Recommendation

Wave and dependency shape:
- **Plan 08-01 (Wave 1):** SQL step schema + guardrail policy foundation
- **Plan 08-02 (Wave 2):** SQL runtime step integration + deterministic SQL error mapping
- **Plan 08-03 (Wave 3):** settings/source override contract + docs/test gate synchronization

Rationale:
- de-risks runtime by locking contract/safety checks first
- keeps guardrail precedence explicit before broad connector expansion
- ensures docs and validation gates stay synchronized with shipped behavior

## Validation Strategy

### Backend contract tests
- `tests/test_generate_schemas.py`
- new `tests/core/test_sql_contracts.py`
- new `tests/core/test_sql_step.py`
- `tests/core/test_settings_manager.py`
- `tests/api/test_settings_api.py`
- `tests/api/test_oauth_interaction_api.py` (or equivalent interaction path tests) to assert SQL risk interactions follow existing authorization-wall protocol

### Docs/contract checks
- `docs/flow/02_step_reference.md`
- `docs/flow/04_step_failure_test_inputs.md`
- optional SQL section in refresh/guardrail docs if runtime policy semantics change
- `skills/PROMPT.md` + `skills/integration-editor/*` to keep AI authoring defaults aligned (writes discouraged, trust-gated if required)

### Phase gate commands
- `python -m pytest tests/test_generate_schemas.py tests/core/test_sql_contracts.py -q`
- `python -m pytest tests/core/test_sql_step.py tests/core/test_settings_manager.py -q`
- `python -m pytest tests/api/test_settings_api.py -q`
- `make test-backend`

## Risks and Mitigations

### Risk 1: Phase 8 scope leaks into full connector parity work
- **Mitigation:** keep connector breadth minimal and focus this phase on contract + safety guarantees.

### Risk 2: SQL safety checks produce false positives/negatives
- **Mitigation:** centralize SQLGlot AST classification in one module with table-driven tests for SELECT vs risky operations and parser edge-cases.

### Risk 3: Credential leakage through exception/log messages
- **Mitigation:** enforce redaction helpers and deterministic, non-credential error details across SQL paths.

### Risk 4: Guardrail precedence ambiguity causes runtime unpredictability
- **Mitigation:** codify precedence in one resolver and cover with settings/source override tests.

## Research Conclusion

Phase 8 should be executed as three plans: contract/safety foundation first (including SQLGlot AST), runtime/error + trust-wall integration second, and settings/docs/prompt-skill synchronization third. This sequence satisfies SQL-01/02/04/05/06 while preserving the roadmap boundary that full connector normalization is Phase 9 scope.
