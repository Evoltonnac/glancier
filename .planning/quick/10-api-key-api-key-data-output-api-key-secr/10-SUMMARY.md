---
phase: quick
plan: 10
status: completed
owner: codex
created_at: 2026-03-16
commit: pending
---

## Objective
Clarify whether API Key input should remain a dedicated step or be generalized into a pure form step, and define the concrete distinction.

## What Changed
- Reviewed current behavior and contracts:
  - `core/steps/auth_step.py`
  - `core/executor.py`
  - `docs/flow/01_architecture_and_orchestration.md`
  - `docs/flow/02_step_reference.md`
- Produced a design decision note for `api_key` vs `form` boundaries.
- Recorded quick task artifacts:
  - `.planning/quick/10-api-key-api-key-data-output-api-key-secr/10-PLAN.md`
  - `.planning/quick/10-api-key-api-key-data-output-api-key-secr/10-SUMMARY.md`

## Decision Note: `api_key` vs `form`
- `api_key` should remain a credential-specialized auth step:
  - Default interaction: password input.
  - Primary intent: credential recovery for protected APIs.
  - Security expectation: map to `secrets` by default.
  - Recovery behavior: naturally tied to invalid-credentials loops.
- `form` should be a generic user-input collection step:
  - Supports multiple typed fields, not only credentials.
  - No built-in persistence semantics; storage is decided by mappings (`secrets` / `outputs` / `context`), same as other steps.
  - Can serve both sensitive and non-sensitive flows depending on mapping choices.

## Key Distinction
The distinction is not "whether it saves data".  
The distinction is "domain responsibility":
- `api_key`: authentication credential acquisition and recovery.
- `form`: general input schema collection.

## Recommendation
- Keep `api_key` for backward compatibility and auth-focused UX defaults.
- Add `form` as an additional generic step for broader input scenarios.
- Avoid coupling persistence policy into step type; keep persistence controlled by mapping channels.

## Validation
- `rg -n "StepType.API_KEY|RequiredSecretMissing|secrets|outputs|context" core docs/flow`
  - Passed (confirmed current behavior from code and docs)

## Scope Boundary
- No runtime behavior changed in backend or frontend.
- No tests run because this quick task is design clarification and planning artifact only.
