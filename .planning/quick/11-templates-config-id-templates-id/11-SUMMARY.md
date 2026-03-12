---
phase: quick
plan: 11
subsystem: configuration
tags:
  - typing
  - models
  - integration
  - schemas
requires: []
provides:
  - Strict ViewComponent ID enforcement
affects:
  - core/config_loader.py
  - ui-react/src/types/config.ts
  - config/schemas
  - config/integrations
key-files:
  created: []
  modified:
    - core/config_loader.py
    - ui-react/src/types/config.ts
    - ui-react/src/pages/Dashboard.tsx
    - config/integrations/*.yaml
    - config/schemas/*.json
key-decisions:
  - Enforce `id` as required string on `ViewComponent` across Python and TypeScript models
  - Auto-generate JSON schemas to validate YAML integrations against the new requirement
  - Add explicit `id` attributes to existing templates in github, openrouter, oauth, and soniox integrations
metrics:
  duration: 60
  tasks-completed: 2
  tasks-total: 2
---

# Phase Quick Plan 11: Make `id` required in templates config

Strictly typed ViewComponent `id` as a required string in all models, schemas, and UI components.

## Objective
将 templates config 中的 `id` 设为必填字段，并修改当前已有集成的 templates 以补齐 `id`，降低潜在的布局和渲染 Bug。

## Completed Tasks
- [x] Task 1: Update type definitions and schemas (Commit: 73b7692)
- [x] Task 2: Update existing code usage and integrations (Commit: 90a320f)

## Deviations from Plan
### Auto-fixed Issues
**1. [Rule 1 - Bug] Fixed TypeScript error in Dashboard.tsx**
- **Found during:** Task 2 (after running typecheck)
- **Issue:** Missing `id` property assignment when casting partial component as `ViewComponent` on line 1069.
- **Fix:** Added `id: item.template_id` to the `comp` definition map in `ui-react/src/pages/Dashboard.tsx`.
- **Files modified:** `ui-react/src/pages/Dashboard.tsx`
- **Commit:** Included in 90a320f

## Self-Check: PASSED
- `npm --prefix ui-react run typecheck` passes without errors.
- Commits are verified.
- Schemas regenerated successfully.
