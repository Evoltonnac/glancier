---
phase: 04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures
plan: 01
subsystem: backend
tags: [webview, refresh-scheduler, retry-policy, error-code, pytest]
requires:
  - phase: 03-remediate-critical-security-audit-findings-in-core-modules
    provides: Deterministic backend error_code persistence in source state records
provides:
  - Deterministic WebView failure classification between manual-required and retry-required outcomes
  - Status plus error_code scheduler retry policy with bounded automatic retries
  - Regression coverage for retry allowlist, backoff windows, and retry cap behavior
affects: [04-02, 04-03, source-state-policy, auto-refresh]
tech-stack:
  added: []
  patterns: [error_code-driven retry eligibility, bounded retry state per source, manual-only webview interaction payloads]
key-files:
  created: []
  modified: [core/executor.py, core/refresh_scheduler.py, tests/core/test_scraper_states.py, tests/core/test_refresh_scheduler.py]
key-decisions:
  - "Auth-wall signals (captcha/login/auth required/verification) remain manual-only webview interactions without implicit force_foreground metadata."
  - "Uncertain webview failures map to runtime.retry_required so scheduler retries can be policy-driven and deterministic."
  - "Scheduler retries are allowlisted to runtime.network_timeout/runtime.retry_required and capped at 3 attempts with 60/180/600 backoff."
patterns-established:
  - "Failure-policy split: manual-required interactions and retryable uncertain failures are handled as separate error contracts."
  - "Retry budget state is keyed by source plus status:error_code signature and resets when source returns active or signature changes."
requirements-completed: [PH4-01, PH4-02]
duration: 6min
completed: 2026-03-20
---

# Phase 4 Plan 01: Web Scraping Failure Policy Contracts Summary

**WebView scraper failures now split cleanly into manual auth-wall interactions and bounded automatic retry paths driven by deterministic runtime error codes.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T04:58:34Z
- **Completed:** 2026-03-20T05:04:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed implicit `force_foreground` defaults from automatic manual-required WebView payload construction while retaining `manual_only=true`.
- Added explicit retry-required classification for uncertain/transient WebView failures (`runtime.retry_required`) without regressing `runtime.network_timeout`.
- Replaced status-only scheduler gating with status+error_code retry policy (allowlist, 60/180/600 backoff, 3-attempt cap).

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement deterministic WebView failure classification without implicit foreground forcing**
   - `83d306a` (`test`): add failing scraper-state policy coverage
   - `04ca762` (`feat`): classify webview failures into manual and retryable buckets
2. **Task 2: Replace status-only scheduler gating with bounded retry policy for uncertain failures**
   - `496a434` (`test`): add failing scheduler retry policy regressions
   - `93a8ce0` (`feat`): add bounded retry scheduling for uncertain runtime failures

_Note: TDD tasks include RED and GREEN commits._

## Files Created/Modified
- `core/executor.py` - Refactored WebView failure normalization/classification and removed implicit foreground forcing defaults.
- `core/refresh_scheduler.py` - Added retry allowlist/state tracking with deterministic 60/180/600 backoff and retry cap.
- `tests/core/test_scraper_states.py` - Added regression tests for manual-only WebView payload shape and retry-required uncertain failures.
- `tests/core/test_refresh_scheduler.py` - Added retry policy/backoff/cap coverage and non-retryable exclusion tests.

## Decisions Made
- Manual-required WebView interactions continue using `auth.manual_webview_required`, but no longer rely on backend-injected `force_foreground`.
- Generic/uncertain WebView failures are represented as `runtime.retry_required` to keep automatic retry behavior explicit and inspectable.
- Retry automation is limited to transient runtime codes only, preventing auth/manual-required loops.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Executor and scheduler now share deterministic failure-policy contracts through persisted `error_code` values.
- Phase 4 follow-up plans can build on the retry policy without backend contract ambiguity.

---
*Phase: 04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures*
*Completed: 2026-03-20*

## Self-Check: PASSED

- FOUND: `.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-01-SUMMARY.md`
- FOUND commits: `83d306a`, `04ca762`, `496a434`, `93a8ce0`
