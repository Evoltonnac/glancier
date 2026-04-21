# Phase 8: sql-step-contracts-and-safety-guardrails - Context

**Gathered:** 2026-03-24  
**Status:** Ready for execution planning

<domain>
## Phase Boundary

Phase 8 introduces the first production SQL step contract for Glanceus with deterministic safety guardrails, AST-based risk classification, and error-code behavior.

This phase is limited to:
- `use: sql` step schema and contract enforcement
- SQL AST risk classification constraints with fully user-authored query text control
- default timeout/max-row guardrails with deterministic source-level override precedence
- stable SQL runtime `error_code` taxonomy with credential-safe diagnostics

This phase does not include:
- cross-connector parity and normalization guarantees across SQLite + PostgreSQL result types (Phase 9)
- chart widget rendering/mapping (Phase 10)
- authoring preview UX and dashboard filter-to-SQL parameter UX (Phase 11)
</domain>

<decisions>
## Locked Decisions

### 1. Contract naming and product language
- Step contract remains `use: sql` (not `db`) to stay aligned with v1.2 roadmap/requirements language.
- Runtime output remains Integration Data consumed by existing backend-first flow pipeline.

### 2. Security model for Phase 8
- SQL query text is fully user-authored (script-like control) and parsed with SQLGlot AST for operation classification.
- Runtime does not provide hidden parameter-injection rewriting; risk checks apply to the final query text before execution.
- Non-SELECT/high-risk statements are routed to the existing authorization wall; execution requires explicit user trust decision.
- Failures must expose deterministic `error_code` values without leaking credentials or full DSNs in logs/API/runtime state.

### 3. Guardrails and precedence
- SQL timeout/max-row defaults are backend-owned.
- Source-level overrides are allowed and must be deterministic.
- Precedence must be explicit and test-covered before Phase 9 connector expansion.

### 4. Dependency and scope discipline
- SQLGlot is introduced for SQL AST classification under explicit security decision.
- Connector expansion that requires new drivers is deferred to Phase 9 planning/execution.

### 5. Reuse Phase 7 trust primitives where applicable
- Existing trust-rule storage/policy primitives (`capability`-scoped) are treated as available foundations for SQL connection-risk policy extension.
- Phase 8 focuses on SQL contract/guardrail determinism; full trust-management UX remains deferred.

### 6. Authoring policy signal
- SQL write operations are supported only as high-risk, trust-gated paths.
- Default guidance for AI-assisted authoring is to avoid writes unless strictly necessary.
</decisions>

<specifics>
## Specific Inputs

Primary planning inputs:
- `.planning/ROADMAP.md` (Phase 8 goal/requirements/success criteria)
- `.planning/REQUIREMENTS.md` (SQL-01, SQL-02, SQL-04, SQL-05, SQL-06)
- `db_step_design.md` (user-provided SQL step proposal and risk notes)

Critical acceptance targets extracted for this phase:
1. `use: sql` can pass integration schema validation with connector profile + secret-backed credentials.
2. SQL execution path enforces AST-based risk checks on final user-controlled query text.
3. Timeout/max-row guardrails apply predictably with per-source override semantics.
4. SQL connect/auth/query/guardrail/trust-gate failures map to stable, non-leaking `error_code` surfaces.
</specifics>

<canonical_refs>
## Canonical References

### Milestone and phase scope
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`

### Product and engineering contracts
- `AGENTS.md`
- `docs/terminology.md`
- `docs/flow/01_architecture_and_orchestration.md`
- `docs/flow/02_step_reference.md`
- `docs/flow/05_refresh_scheduler_and_retry.md`
- `docs/testing_tdd.md`

### Existing security/storage baseline
- `.planning/phases/07-risk-operation-trust-authorization-rule-storage-and-http-step-refactor/07-CONTEXT.md`
- `.planning/phases/07-risk-operation-trust-authorization-rule-storage-and-http-step-refactor/07-RESEARCH.md`
- `core/network_trust/models.py`
- `core/network_trust/policy.py`
- `core/storage/sqlite_trust_rule_repo.py`
</canonical_refs>

<code_context>
## Existing Code Insights

### Current gap
- `StepType` does not include `sql` and no SQL step module is wired in executor.
- `docs/flow/02_step_reference.md` step catalog does not define SQL contract behavior.

### Existing reusable foundations
- Flow arg substitution already supports secret/context references and nested mapping resolution.
- Error envelope pipeline already supports deterministic `code/summary/details/step_id` formatting.
- Script/http phases established a pattern for deterministic runtime error-code testing.
- Settings API + persistence already carry execution guardrails for other steps (`script_timeout_seconds`, `http_private_target_policy_default`).

### Existing constraints to preserve
- Backend owns workflow/auth/state; frontend should not absorb SQL runtime business logic.
- Stable `error_code`-driven diagnostics and i18n compatibility are required contracts.
- Minimal reversible changes and additive schema evolution are expected.
- Existing authorization-wall protocol (`confirm` interaction + persisted trust rules) should be reused for SQL risk operations.
</code_context>

<deferred>
## Deferred Ideas

- Full SQL connector parity and normalized typed Integration Data output guarantees (`rows` + field metadata across SQLite/PostgreSQL) are deferred to Phase 9.
- SQL chart rendering contracts are deferred to Phase 10.
- SQL preview/authoring UX and dashboard filter parameter UX are deferred to Phase 11.
- Mongo/GraphQL operation-risk AST/classification framework is evaluated in Phase 8 and scheduled for subsequent phases using the same authorization-wall fallback model.
</deferred>

---

*Phase: 08-sql-step-contracts-and-safety-guardrails*  
*Context gathered: 2026-03-24*
