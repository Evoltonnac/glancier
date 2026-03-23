---
phase: 04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures
plan: 02
subsystem: api
tags: [fastapi, react, tauri, webview-scraper, retry-policy]
requires:
  - phase: 04-01
    provides: Manual-required vs retryable runtime policy baseline for scraper failures and scheduler retries.
provides:
  - Internal scraper fail callback classification into manual-required and retry-required outcomes.
  - Explicit-intent foreground behavior in scraper hook queue controls.
  - Regression coverage for backend fail contracts and frontend foreground intent logic.
affects: [04-03, scraper-daemon, frontend-flowhandler]
tech-stack:
  added: []
  patterns:
    - Deterministic error_code updates on internal fail callbacks.
    - Foreground mode only through explicit UI action parameters.
key-files:
  created: []
  modified:
    - core/api.py
    - tests/core/test_scraper_internal_api.py
    - ui-react/src/hooks/useScraper.ts
    - ui-react/src/hooks/useScraper.test.ts
key-decisions:
  - "Treat auth-wall/captcha/login-like scraper fail reasons as manual_required with suspended webview interaction and auth.manual_webview_required."
  - "Treat non-manual scraper fail reasons as runtime.retry_required errors without interaction payload so retries stay backend-owned."
  - "Ignore legacy interaction.data.force_foreground and require options.foreground=true for foreground queue promotion."
patterns-established:
  - "Internal callbacks classify by fail reason text and emit deterministic status/error_code contracts."
  - "Auth-required listener metadata keeps manual_only/blocked_target_url but does not encode automatic foreground forcing."
requirements-completed: [PH4-03, PH4-04]
duration: 5min
completed: 2026-03-20
---

# Phase 4 Plan 2: Web Scraper Fail Contract and Foreground Intent Summary

**Internal scraper fail callbacks now emit deterministic manual-vs-retry contracts, and frontend scraper controls only enter foreground mode from explicit user actions.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T05:14:30Z
- **Completed:** 2026-03-20T05:19:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added backend fail-reason classification in `/api/internal/scraper/fail` to split manual-required auth-wall failures from retryable uncertain runtime failures.
- Removed default `force_foreground` metadata from manual webview interaction payloads while preserving `manual_only`.
- Updated `useScraper` to gate foreground promotion on explicit `options.foreground` and ignore legacy `interaction.data.force_foreground`.
- Added backend and frontend regression tests covering manual-required behavior, retryable uncertain behavior, idempotency, and auth-required listener payload shaping.

## Task Commits

Each task was committed atomically:

1. **Task 1: Classify internal scraper fail callbacks into manual-required vs retryable-uncertain contracts**
   - `8482770` test(04-02): add failing scraper fail-classification regressions
   - `5969a74` feat(04-02): classify internal scraper failures by retry contract
2. **Task 2: Ensure frontend scraper controls only use foreground mode on explicit user intent**
   - `37b0500` test(04-02): add explicit-intent scraper queue behavior coverage
   - `69795ea` feat(04-02): require explicit user intent for foreground scraper mode
   - `7fd2ca8` test(04-02): fix useScraper legacy metadata test typing

## Files Created/Modified
- `core/api.py` - Added fail classification helper, deterministic error_code writes, and removed default foreground forcing metadata.
- `tests/core/test_scraper_internal_api.py` - Added regression coverage for manual-required, retry-required, and idempotent fail callback semantics.
- `ui-react/src/hooks/useScraper.ts` - Foreground mode now depends only on explicit options; auth-required listener metadata no longer emits `force_foreground`.
- `ui-react/src/hooks/useScraper.test.ts` - Added explicit-intent behavior tests and auth-required payload shaping assertions.

## Decisions Made
- Internal scraper fail classification is now text-keyword based with deterministic contracts:
  - manual-required -> `status=suspended`, `interaction.type=webview_scrape`, `error_code=auth.manual_webview_required`
  - retry-required -> `status=error`, no interaction payload, `error_code=runtime.retry_required`
- Frontend retry path defaults to backend-owned refresh orchestration unless UI action explicitly requests foreground mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript typing regression introduced by new hook test fixture spread**
- **Found during:** Task 2 verification (`make test-typecheck`)
- **Issue:** New test mutated `source.interaction` with optional spread semantics, widening `interaction.type` to possibly undefined and failing typecheck.
- **Fix:** Preserved strong `InteractionRequest` typing by spreading a non-null `interaction` local when injecting legacy test metadata.
- **Files modified:** `ui-react/src/hooks/useScraper.test.ts`
- **Verification:** `make test-typecheck`
- **Committed in:** `7fd2ca8`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Blocking fix was required to satisfy mandated typecheck verification; no scope creep.

## Issues Encountered
- `make test-typecheck` failed after initial Task 2 test additions due to widened optional type in test fixture construction; resolved inline with a typed fixture update.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Internal fail contracts and frontend queue semantics are aligned for explicit-intent foreground behavior.
- Phase 04-03 can now build on deterministic retry/manual boundaries without legacy foreground fallback assumptions.

## Self-Check: PASSED
