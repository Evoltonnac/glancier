---
phase: quick
plan: 12
subsystem: bootstrap
tags:
  - bootstrap
  - config
  - presets
  - api
requires: []
provides:
  - Starter bundle externalized to YAML files
  - Preset templates externalized and API-driven
affects:
  - core/bootstrap.py
  - core/api.py
  - config/examples
  - config/presets
  - ui-react/src/pages/Integrations.tsx
key-files:
  created:
    - config/examples/integrations/devto_opensource.yaml
    - config/examples/integrations/openrouter_tools.yaml
    - config/examples/integrations/twitch_media_oauth.yaml
    - config/examples/integrations/icloud_webscraper.yaml
    - config/examples/integrations/gold_price_market.yaml
    - config/examples/starter_sources.yaml
    - config/examples/starter_view.yaml
    - config/presets/api_key.yaml
    - config/presets/oauth2.yaml
    - config/presets/curl.yaml
    - config/presets/webscraper.yaml
    - tests/api/test_integration_presets_api.py
  modified:
    - core/bootstrap.py
    - core/api.py
    - tests/core/test_bootstrap_starter_bundle.py
    - ui-react/src/api/client.ts
    - ui-react/src/pages/Integrations.tsx
    - ui-react/src/pages/Integrations.test.tsx
    - ui-react/tests/e2e/test_ui.spec.ts
key-decisions:
  - Remove starter data hardcoding from `core/bootstrap.py` and load from `config/examples`.
  - Reuse extracted Python source/view creation functions used by `/api/sources` and `/api/views`.
  - Add `/api/integrations/presets` and have Integrations page load preset YAML templates from backend.
metrics:
  duration: 90
  tasks-completed: 3
  tasks-total: 3
---

# Quick 12 Summary

Completed externalization of starter bootstrap and integration presets to YAML-driven config.

## Completed Tasks
- [x] Task 1: Bootstrap externalization to `config/examples` (Commit: 54af1d5)
- [x] Task 2: Reuse existing Python source/view creation path (Commit: 54af1d5)
- [x] Task 3: Externalize presets to `config/presets` and wire frontend (Commit: 54af1d5)

## Verification
- `pytest tests/core/test_bootstrap_starter_bundle.py tests/core/test_app_startup_resilience.py tests/api/test_integration_files_api.py tests/api/test_integration_presets_api.py -q` (passed: 9)
- `npm --prefix ui-react run typecheck` (passed)

## Notes
- `npm --prefix ui-react run test:core` still reports an existing Vitest environment issue for `src/pages/Integrations.test.tsx`: `Failed to resolve entry for package "monaco-editor"`.
