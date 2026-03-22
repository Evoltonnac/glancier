---
phase: 04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures
plan: 03
subsystem: tauri
tags: [tauri, rust, webview-scraper, fallback-policy, docs]
requires:
  - phase: 04-01
    provides: Retry-required scheduler policy and deterministic webview failure contracts.
  - phase: 04-02
    provides: Internal fail classification and explicit foreground-intent frontend controls.
provides:
  - Auth-required scraper fallback that emits manual-required signals without implicit window focus stealing.
  - Preserved explicit foreground behavior for user-triggered manual window actions.
  - Updated runtime and flow docs for manual_only payload semantics and bounded retry policy details.
affects: [phase-04-closeout, webview-scraper-runtime, dashboard-diagnostics]
tech-stack:
  added: []
  patterns:
    - Auth-required fallback remains non-intrusive by default; focus is only user-driven.
    - Runtime fallback docs are synchronized with deterministic retry policy and payload contracts.
key-files:
  created: []
  modified:
    - ui-react/src-tauri/src/scraper.rs
    - docs/webview-scraper/02_runtime_and_fallback.md
    - docs/flow/04_step_failure_test_inputs.md
key-decisions:
  - "Remove implicit show/focus/resize actions from handle_scraper_auth while preserving event emission and backend fail callback."
  - "Keep manual foreground behavior only in explicit entry points (show_scraper_window and foreground task start paths)."
  - "Document manual_only=true without force_foreground default and keep uncertain retry policy at 3 attempts with 60/180/600 second backoff."
patterns-established:
  - "TDD contract tests assert no-auto-focus fallback and explicit-foreground focus behavior in Rust source."
  - "Phase docs define retry-required vs manual-required behavior with deterministic payload expectations."
requirements-completed: [PH4-05]
duration: 3min
completed: 2026-03-20
---

# Phase 4 Plan 3: No-Focus Auth Fallback and Retry Contract Sync Summary

**Rust auth-required fallback now remains non-intrusive by default while explicit user actions still foreground scraper windows, with docs aligned to manual-only payload and bounded retry policy.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T05:24:06Z
- **Completed:** 2026-03-20T05:27:13Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added failing-then-passing Rust contract tests for auth fallback focus behavior and explicit foreground behavior.
- Removed implicit show/focus/resize from `handle_scraper_auth` and updated lifecycle logging to manual-action-required messaging.
- Updated runtime and flow docs to remove `force_foreground=true` default fallback assumptions and document retry budget (`3` attempts, `60/180/600s`).
- Completed final verification gates: `cargo test --manifest-path ui-react/src-tauri/Cargo.toml` and `make test-impacted`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove implicit show/focus from Rust auth-required fallback path**
   - `06491ab` test(04-03): add failing fallback focus policy tests
   - `b89e21c` feat(04-03): remove implicit auth fallback window focus
2. **Task 2: Synchronize runtime fallback documentation with Phase 4 behavior contract**
   - `3aaba02` chore(04-03): align webview fallback and retry docs
3. **Task 3: Verify no focus stealing in hidden/auxiliary runtime conditions**
   - `⚡ Auto-approved` checkpoint:human-verify (workflow `auto_advance=true`)

## Files Created/Modified
- `ui-react/src-tauri/src/scraper.rs` - Removed automatic auth fallback window reveal/focus actions and added fallback/foreground contract tests.
- `docs/webview-scraper/02_runtime_and_fallback.md` - Added explicit no-auto-focus fallback contract and bounded uncertain retry policy details.
- `docs/flow/04_step_failure_test_inputs.md` - Updated webview failure expectations to `manual_only=true` without implicit `force_foreground`, plus uncertain retry test input contract.

## Decisions Made
- Automatic auth-required fallback is signal-only and must not invoke window focus/foreground operations.
- Explicit manual recovery continues to use existing foreground commands that show and focus scraper windows.
- Documentation is now the source of truth for `manual_only` semantics and uncertain retry budget values (`3`, `60/180/600s`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Manually updated planning docs after partial gsd-tools state sync failures**
- **Found during:** Post-task state update stage
- **Issue:** `state advance-plan` could not parse current-plan markers in `STATE.md`, and `roadmap update-plan-progress` reported success without applying the Phase 4 plan checkbox/count mutation.
- **Fix:** Applied minimal manual updates to `.planning/STATE.md` current position/last activity and `.planning/ROADMAP.md` Phase 4 plan completion line.
- **Files modified:** `.planning/STATE.md`, `.planning/ROADMAP.md`
- **Verification:** `git diff` confirmed Phase 4/04-03 completion state is now reflected in both files.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No product/runtime scope change; only execution metadata synchronization fallback.

## Issues Encountered

- `requirements mark-complete PH4-05` returned `not_found` because `PH4-05` is not present in current `.planning/REQUIREMENTS.md` traceability entries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 04 fallback behavior is aligned across Rust runtime and docs with no focus-stealing default path.
- Manual recovery remains intact for user-triggered foreground flows, enabling stable closeout verification.

## Self-Check: PASSED
