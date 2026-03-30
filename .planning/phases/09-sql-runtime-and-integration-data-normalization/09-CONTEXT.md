# Phase 9: SQL Runtime and Integration Data Normalization - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers SQL runtime connector parity and stable Integration Data normalization for SQL outputs.

This phase is limited to:
- executing one `use: sql` contract across at least SQLite and PostgreSQL connector profiles;
- producing deterministic normalized SQL Integration Data (`rows` plus typed field metadata);
- preserving backend-owned workflow/auth/state boundaries while keeping SQL outputs consumable through existing template channels.

This phase does not include chart widget rendering (Phase 10) or authoring preview/filter UX hardening (Phase 11).

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<specifics>
## Specific Ideas

Auto-mode choices applied in this session:
- `[auto]` Context scope uses v1.2 roadmap Phase 9 (`SQL Runtime and Integration Data Normalization`), not legacy milestone Phase 09.
- `[auto]` Selected all remaining gray areas for clarification: connector parity scope, credential contract, normalized envelope, and serialization policy.
- `[auto]` Recommended defaults chosen: keep single `use: sql` contract, lock v1.2 parity to SQLite/PostgreSQL, keep backend-owned normalization boundary, and retain compatibility aliases while adding canonical normalized metadata.

No additional user-specific examples or product references were provided in this run.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope and Requirements
- `.planning/ROADMAP.md` — Phase 9 boundary, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — SQL-03 and DATA-01..04 acceptance targets.
- `.planning/STATE.md` — active milestone continuity and latest phase-transition context.
- `.planning/PROJECT.md` — config-first non-negotiables and backend/frontend ownership boundary.

### Product and Engineering Contracts
- `AGENTS.md` — repository engineering contract and required validation gates.
- `docs/terminology.md` — canonical domain language (`Metric`, `Signal`, `Integration Data`, `Bento Card`).
- `docs/flow/01_architecture_and_orchestration.md` — flow channels and orchestration boundary.
- `docs/flow/02_step_reference.md` — `use: sql` step contract and existing runtime envelope/error semantics.
- `docs/flow/04_step_failure_test_inputs.md` — deterministic SQL failure matrix and expected `error_code` contracts.
- `docs/flow/05_refresh_scheduler_and_retry.md` — SQL guardrail precedence and retry semantics.
- `docs/flow/06_storage_contract_and_migration.md` — storage contract constraints for runtime persistence behavior.
- `docs/sdui/01_architecture_and_guidelines.md` — SDUI rendering boundary (frontend render-only).
- `docs/sdui/03_template_expression_spec.md` — template expression access semantics for normalized SQL outputs.

### Prior Phase Baseline (Must Carry Forward)
- `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-CONTEXT.md` — locked Phase 8 decisions and explicit Phase 9 deferrals.
- `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-CONNECTOR-RISK-EVAL.md` — connector risk model parity expectations and trust-gate fallback contract.
- `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-02-SUMMARY.md` — shipped SQL runtime baseline and deterministic error-code behavior.
- `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-03-SUMMARY.md` — shipped settings/docs/policy sync and guardrail precedence baseline.

### v1.2 Research Inputs
- `.planning/research/SUMMARY.md` — milestone-level SQL normalization and architecture sequencing recommendations.
- `.planning/research/ARCHITECTURE.md` — proposed connector strategy and normalization boundary.
- `.planning/research/PITFALLS.md` — known pitfalls (placeholder mismatch, async blocking, schema drift, type/timezone drift).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `core/steps/sql_step.py`: existing SQL runtime baseline (trust-gate path, guardrail handling, deterministic SQL error mapping, sqlite execution path, `sql_response` envelope).
- `core/sql/contracts.py`: SQLGlot-based static classification and risk signals for trust routing.
- `core/config_loader.py`: `StepType.SQL` and SQL step args schema as contract entry point.
- `core/executor.py`: SQL step dispatch + SQL-specific error normalization and state persistence behavior.
- `core/settings_manager.py`: persisted SQL guardrail defaults (`sql_default_timeout_seconds`, `sql_default_max_rows`).
- `tests/core/test_sql_step.py`: deterministic regression coverage for SQL runtime envelope, trust behavior, guardrails, and redaction.

### Established Patterns
- Runtime failures must surface stable machine-parseable `error_code` values.
- Sensitive SQL diagnostics must be redacted before logs/state persistence.
- Backend owns execution/auth/state transitions; frontend consumes Integration Data through existing API/template contracts.
- Contract/schema changes and docs updates are expected to land together to avoid authoring/runtime drift.

### Integration Points
- Extend SQL runtime adapter path in `core/steps/sql_step.py` for PostgreSQL parity while preserving existing sqlite behavior.
- Extend normalized envelope fields consumed by `outputs/context` mapping without breaking existing `sql_response` paths.
- Update schema/docs/tests in lockstep (`core/config_loader.py`, generated schemas, flow docs, SQL tests) to keep contracts deterministic.

</code_context>

<deferred>
## Deferred Ideas

- Additional connector profiles beyond SQLite/PostgreSQL (for example MySQL) remain deferred after Phase 9 baseline completion.
- SQL chart widget rendering and mapping UX remain in Phase 10 scope.
- SQL preview workflows, localized diagnostics improvements, and dashboard filter-to-SQL param orchestration remain in Phase 11 scope.
- Mongo/GraphQL runtime classifier parity remains follow-up work beyond this phase boundary.

</deferred>

---

*Phase: 09-sql-runtime-and-integration-data-normalization*
*Context gathered: 2026-03-24*
