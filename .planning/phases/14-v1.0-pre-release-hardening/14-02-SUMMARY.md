---
phase: 14-v1.0-pre-release-hardening
plan: 02
status: completed
completed: 2026-03-10
---

# Phase 14 Plan 02: Preset + Starter Bundle Summary

## One-line Outcome
Completed Plan `14-02` by fixing exactly four selectable integration presets in UI and shipping an idempotent first-launch starter bundle with five runnable scenario chains (integration + source + dashboard widget).

## Tasks Completed

1. Implemented fixed four preset definitions in `ui-react/src/constants/integrationPresets.ts` and wired `ui-react/src/pages/Integrations.tsx` to consume them:
   - Preset IDs are now fixed to `api_key`, `oauth2`, `curl`, `webscraper`.
   - Preset definitions are centralized (no longer inline in page component).
   - cURL preset template now includes detailed English tutorial comments for header customization and payload filtering.
2. Implemented starter configuration bundle in `core/bootstrap.py` and integrated it into app startup from `main.py`:
   - Added five required starter scenarios:
     - DEV.to (普通 Fetch 科技/开源)
     - OpenRouter (API Key 开发者/工具)
     - Twitch (OAuth 娱乐/媒体)
     - iCloud (WebView Scraper 生活/隐私)
     - Gold Price (免鉴权 API 金融/市场)
   - Each scenario now includes a concrete integration YAML, one source, and one dashboard widget path.
   - Seeding logic is idempotent and supports retry on partial starter-only workspace state.
   - Seeding is skipped when non-starter user artifacts already exist.
3. Updated and added tests for bootstrap/preset requirements:
   - Updated `tests/core/test_app_startup_resilience.py` expectations to verify five-scenario starter seeding.
   - Added `tests/core/test_bootstrap_starter_bundle.py` for:
     - empty-workspace seed success,
     - idempotent retries,
     - skip behavior when custom workspace data exists.

## Verification

- `rg -n "api_key|oauth2|curl|webscraper" ui-react/src/constants/integrationPresets.ts ui-react/src/pages/Integrations.tsx` (passed)
- `pytest tests -k "bootstrap or preset" -q` (passed, 3 selected tests)
- `pytest tests/core/test_app_startup_resilience.py -q` (passed, 2 tests)
- `npm --prefix ui-react run typecheck` (passed)

## Pause State

Plan `14-02` is complete. This pause point was later replanned: `14-03` has been merged into `14-06`, and the next execution queue is `14-04` / `14-05`.
