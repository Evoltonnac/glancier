---
phase: 13-release-v1.0-build-release
plan: 04
status: completed
completed: 2026-03-08
---

# Phase 13 Plan 04: E2E and UI Smoke Coverage Summary

## One-line Outcome
Completed release-smoke automation for v1.0 by landing Playwright UI tests and Python E2E smoke tests, then verifying both suites pass.

## Tasks Completed

1. Finalized Playwright UI spec in [`ui-react/tests/e2e/test_ui.spec.ts`](ui-react/tests/e2e/test_ui.spec.ts):
   - Added dashboard, integration-preset, and settings bug-report coverage using mocked API responses.
   - Fixed route mocking scope to avoid intercepting frontend module paths (which previously blanked the app during tests).
2. Added Playwright config in [`ui-react/playwright.config.ts`](ui-react/playwright.config.ts):
   - Configured test directory, local web server, and base URL for deterministic UI execution.
3. Added Python smoke suite in [`tests/smoke/test_phase13_e2e.py`](tests/smoke/test_phase13_e2e.py):
   - Covered integration creation -> source refresh flow.
   - Covered OAuth authorize/code-exchange flow.
   - Covered webview interaction resume flow with secrets/state updates.
4. Improved integration trigger accessibility in [`ui-react/src/pages/Integrations.tsx`](ui-react/src/pages/Integrations.tsx):
   - Added `aria-label="New Integration"` to icon-only trigger buttons to make E2E selectors stable and improve accessibility.

## Verification

- `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NPM_CONFIG_USERCONFIG=/dev/null PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright bash -lc "cd ui-react && npx playwright test tests/e2e/test_ui.spec.ts"`
- `pytest tests/smoke/test_phase13_e2e.py`

Both passed.

## Next Plan Readiness

Phase 13 Plan 04 complete. Remaining Phase 13 plans: 13-01 and 13-03.
