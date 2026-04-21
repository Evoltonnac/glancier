# Phase 7: risk-operation-trust-authorization-rule-storage-and-http-step-refactor - Context

**Gathered:** 2026-03-24  
**Status:** Ready for execution planning

<domain>
## Phase Boundary

Phase 7 introduces trust authorization for risky network targets and replaces the `http` step private/loopback hard block with a policy-driven trust gate.

This phase is limited to:
- `http` target classification and trust-gate runtime behavior
- extensible trust-rule persistence in SQLite storage contract domain
- deterministic error-code and interaction contracts
- source lifecycle cleanup guarantees for source-scoped trust rules

This phase does not include full DB-step enforcement or a standalone trust-rule management UI surface.
</domain>

<decisions>
## Locked Decisions

### 1. Threat model and policy objective
- For local Glanceus deployments, private-network access itself is a valid capability.
- Primary risk is untrusted integration YAML using local runtime as an internal probe/exfiltration channel.
- Policy must keep user in control with explicit trust decisions.

### 2. Runtime behavior shift for `http` step
- Keep `http`/`https` scheme guard.
- Replace private/loopback hard deny with trust gate:
  - no decision -> interaction required (`runtime.network_trust_required`)
  - explicit deny -> deterministic reject (`runtime.network_target_denied`)
  - invalid target/scheme -> deterministic reject (`runtime.network_target_invalid`)

### 3. Trust decision model
- Decision actions:
  - allow once (ephemeral, session/runtime memory only)
  - allow always (persisted rule)
  - deny (persisted rule)
- Persisted rules must support connector extensibility (`http`, `db`, future capabilities) and source/global scopes.

### 4. Storage boundary and lifecycle
- Persist trust rules in SQLite (same storage contract domain), not new JSON files.
- Source-scoped rules must be cleaned automatically during source deletion lifecycle (`ON DELETE CASCADE`).
- Rule uniqueness and normalization must prevent duplicate/conflicting rows for same capability/scope/target.

### 5. Optional global default policy
- Add `http_private_target_policy_default` with values `prompt | allow | deny`.
- Default remains `prompt`.
- Keep settings compatibility and deterministic serialization through existing `/api/settings` path.
</decisions>

<specifics>
## Specific Inputs from User-Provided Proposal

Primary planning input:
- `docs/flow/http_local_network_policy_proposal.md`

Critical acceptance targets extracted from proposal:
1. Private target without trust decision returns interaction-required state.
2. Allow rule enables request execution.
3. Deny rule blocks execution with deterministic code.
4. Public targets remain unaffected.
5. Source deletion cleans source-scoped trust rules through storage lifecycle.
</specifics>

<canonical_refs>
## Canonical References

### Milestone and Phase Scope
- `.planning/ROADMAP.md` (Phase 7 goal, requirements, success criteria)
- `.planning/STATE.md` (current phase status)
- `.planning/REQUIREMENTS.md` (v1.2 requirement baseline)

### Product and Engineering Contracts
- `AGENTS.md`
- `docs/terminology.md`
- `docs/flow/01_architecture_and_orchestration.md`
- `docs/flow/02_step_reference.md`
- `docs/flow/06_storage_contract_and_migration.md`
- `docs/testing_tdd.md`

### Phase-Specific Proposal
- `docs/flow/http_local_network_policy_proposal.md`
</canonical_refs>

<code_context>
## Existing Code Insights

### Current behavior to replace
- `core/steps/http_step.py` currently blocks private/loopback hosts with `RuntimeError("http_target_blocked_private:*")`.
- No persisted trust-rule model exists in storage contract.

### Existing interaction and error-code surfaces
- `core/executor.py` persists deterministic `error_code` via `_update_state(..., error_code=...)`.
- `core/api.py` interaction endpoint currently stores generic payloads to secrets and resumes fetch.
- `ui-react/src/components/auth/FlowHandler.tsx` supports rendering interaction modals with submit flow and error-code-first copy.

### Existing storage and lifecycle surfaces
- `core/storage/sqlite_connection.py` defines bootstrap DDL and schema user_version handling.
- `core/storage/sqlite_resource_repo.py` manages source/view persistence in SQLite.
- `core/api.py` delete-source flow already coordinates data/secrets/view cleanup and can rely on SQLite FK cascade for source-scoped trust rules once added.
</code_context>

<deferred>
## Deferred Ideas

- DB-step policy checks using shared trust-rule schema (`capability=db`) are explicitly deferred.
- Full trust-rule management UI page (CRUD listing/editor) is deferred; this phase focuses on runtime trust gate and interaction decision flow.
- DNS rebinding hardening is deferred follow-up work.
</deferred>

---

*Phase: 07-risk-operation-trust-authorization-rule-storage-and-http-step-refactor*  
*Context gathered: 2026-03-24*
