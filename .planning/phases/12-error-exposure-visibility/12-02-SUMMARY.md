---
phase: 12-error-exposure-visibility
plan: 02
status: completed
completed: 2026-03-07
---

# Phase 12 Plan 02: Flow Execution Fail-Fast & Error UI Summary

## One-line Outcome
Implemented fail-fast flow execution with structured backend error surfacing (including script stream capture), and added persistent clickable error badges with details toggle in Dashboard cards/sidebar.

## Tasks Completed

1. Updated `core/executor.py`:
   - Added fail-fast flow error wrapping (`FlowExecutionError`) so first failing step halts execution immediately.
   - Added pre-step auth gate for `curl` and `script` steps to fail early with auth interaction when credentials are missing.
   - Added script `stdout`/`stderr` relay into runtime state messages for better live visibility.
   - Added richer backend error formatting with summary + raw traceback sections.
2. Updated `core/data_controller.py` and `core/api.py`:
   - `set_state` now preserves existing records while updating status fields.
   - Runtime error summary can be persisted explicitly and stale errors are cleared on non-error states.
   - `/api/sources` now exposes `error_details` and falls back to runtime state when persisted `error` is absent.
3. Added backend tests in `tests/core/test_executor_errors.py`:
   - Fail-fast stop on first failing step.
   - Script stream capture in error details.
   - OAuth auth-gate short-circuit before `curl` execution.
4. Updated Dashboard UI (`ui-react/src/components/BaseSourceCard.tsx`, `ui-react/src/pages/Dashboard.tsx`, `ui-react/src/types/config.ts`):
   - Source cards show a persistent clickable error badge.
   - Sidebar error status becomes clickable for error details.
   - Added centralized error dialog with concise message + “show stack details” toggle.
   - Added “re-run” action directly from the error dialog.

## Verification

- `pytest tests/core/test_executor_errors.py -q`
- `pytest tests/core/test_executor_auth_interactions.py -q`
- `npm run build --prefix ui-react`

All checks passed.

## Deviations from Plan

- Instead of introducing a new standalone error payload model, reused existing `message/error` channels and added `error_details` in source summary to keep compatibility with current API consumers.

## Next Plan Readiness

Plan `12-02` is complete. Phase 12 execution can continue with `12-03` (interactive step states + webscraper foregrounding).
