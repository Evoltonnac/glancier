# Phase 7: Risk-Operation Trust Authorization, Rule Storage, and HTTP Step Refactor - Research

**Researched:** 2026-03-24  
**Phase:** 7  
**Requirement IDs:** SEC-HTTP-01, SEC-HTTP-02, SEC-DB-01, STORAGE-TRUST-01  
**Primary Input:** `docs/flow/http_local_network_policy_proposal.md`

## Objective

Define a minimal, testable implementation path that:
- allows local/private HTTP targets with explicit trust authorization
- keeps deterministic runtime `error_code` contracts
- persists reusable trust rules in SQLite with source-lifecycle cleanup
- avoids backend/frontend boundary drift

## Scope Constraints

- No new core dependency upgrades.
- Backend remains owner of trust workflow/auth/state; frontend renders and submits interaction decisions.
- Avoid hidden fallback behavior; every trust decision path must be explicit and auditable.
- Keep existing public-target HTTP behavior unchanged.

## Current Gaps

1. `http` step private-target policy is hard deny (`http_target_blocked_private:*`) and not user-authorizable.
2. No storage model for capability/scope/target trust rules.
3. Interaction submit path has no explicit decision protocol for trust-gate actions (`allow_once`, `allow_always`, `deny`).
4. Error-code surfaces do not yet include network trust decision states.

## Recommended Architecture

### A. Trust target classification and policy evaluator

Introduce a backend trust-policy module with:
- target classification: `public | private | loopback`
- policy evaluation result: `allow | deny | prompt`
- precedence:
  1. source-scoped deny
  2. source-scoped allow
  3. global deny
  4. global allow
  5. default setting (`prompt` by default)

Notes:
- Keep `http`/`https` scheme guard in the evaluator contract.
- `allow_once` remains runtime-memory and is never persisted.

### B. Storage contract extension for trust rules

Add SQLite table in storage bootstrap:
- `connection_trust_rules`
- foreign key `source_id -> stored_sources(source_id) ON DELETE CASCADE`
- deterministic unique index for capability/scope/target identity

Repository responsibilities:
- upsert allow/deny rule
- query matching rule(s) by capability + scope + target
- delete scoped/global rules for maintenance/testing

### C. Runtime and interaction contract

`http` step flow for private/loopback target:
1. Evaluate policy.
2. If `prompt`: raise structured trust-required exception.
3. Executor maps exception to interaction payload containing source/step/target metadata and available actions.
4. Interaction submit endpoint records/passes decision:
   - `allow_once` -> executor in-memory grant
   - `allow_always` -> persisted trust rule
   - `deny` -> persisted deny rule or immediate deny state
5. Resume flow deterministically.

## Sequencing Recommendation

Wave and dependency shape:
- **Plan 07-01 (Wave 1):** storage + trust-policy foundation
- **Plan 07-02 (Wave 2):** `http` runtime integration + interaction/UI contract + docs gates

Rationale:
- Keeps schema/repository risk isolated before runtime behavior changes.
- Reduces merge conflicts across `core/storage/*`, `core/steps/http_step.py`, `core/api.py`, and UI interaction files.

## Validation Strategy

### Backend contract tests
- `tests/core/test_storage_contract_sqlite.py`
- `tests/core/test_http_step.py`
- new targeted trust-policy tests (evaluator + precedence + allow-once)
- `tests/api/test_source_delete_api.py`
- new API interaction tests for trust decisions

### Frontend contract tests
- `ui-react/src/components/auth/FlowHandler.test.tsx` for trust action rendering/submission.
- i18n key presence for new deterministic `error_code` copy in both `en` and `zh`.

### Phase gate commands
- `python -m pytest tests/core/test_storage_contract_sqlite.py tests/core/test_http_step.py -q`
- `python -m pytest tests/api/test_source_delete_api.py tests/api/test_settings_api.py -q`
- `npm --prefix ui-react run test -- --run src/components/auth/FlowHandler.test.tsx`
- `make test-backend`
- `make test-frontend`
- `make test-typecheck`

## Risks and Mitigations

### Risk 1: Interaction payload path leaks into secrets writes
- **Mitigation:** Add explicit trust-interaction protocol branch in `interact_source` that bypasses generic `_secrets.set_secrets(...)` behavior.

### Risk 2: Rule precedence ambiguity causes non-deterministic outcomes
- **Mitigation:** Encode precedence in one policy module and cover with table-driven tests.

### Risk 3: Schema change breaks startup behavior
- **Mitigation:** Keep DDL additive and bootstrap-idempotent; extend storage bootstrap tests with trust-rule table/index assertions.

### Risk 4: UI cannot express multi-action trust decisions
- **Mitigation:** Extend existing `confirm` interaction rendering with explicit action buttons keyed by backend-provided action metadata.

## Research Conclusion

Phase 7 should be executed as two plans: first establish durable trust-rule primitives in the storage contract domain, then apply them to `http` runtime and interaction/UI flows with deterministic error-code and i18n-aligned diagnostics.
