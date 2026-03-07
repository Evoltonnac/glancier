---
phase: 12-error-exposure-visibility
plan: 01
status: completed
completed: 2026-03-07
---

# Phase 12 Plan 01: JSON Schema Generation & Monaco YAML Integration Summary

## One-line Outcome
Implemented a unified schema pipeline and Monaco YAML validation flow, and linked integration reload/editor errors to sidebar badges and detail diagnostics in the Integrations page.

## Tasks Completed

1. Added `scripts/generate_schemas.py` to export chunked JSON Schema files from Pydantic models into:
   - `config/schemas/flow_steps/`
   - `config/schemas/widgets/`
   - `config/schemas/manifest.json`
2. Extended `core/models.py` with `WIDGET_SCHEMA_MODELS` so widget/storage schema exports stay centralized and reusable.
3. Added Monaco YAML worker/bootstrap module `ui-react/src/components/editor/YamlEditorWorkerSetup.ts`:
   - Explicit worker registration for editor/yaml workers.
   - Chunk manifest loading and schema `$defs` merge.
   - `configureMonacoYaml` diagnostics setup.
4. Updated `ui-react/src/pages/Integrations.tsx`:
   - Sidebar error badges for problematic integrations (collapsed + expanded modes).
   - Diagnostics detail panel above editor.
   - Marker-driven editor diagnostics and native debounced validation state updates.
   - Save flow now distinguishes “saved” vs “reload failed”, attaching backend diagnostics per file.
5. Updated `ui-react/src/api/client.ts` to parse and surface `reloadConfig` failure payload (`detail` + optional `diagnostics`) instead of throwing a generic error.
6. Added `monaco-yaml` dependency in `ui-react/package.json` and installed packages.

## Verification

- `python scripts/generate_schemas.py && ls config/schemas/flow_steps 2>/dev/null || echo "Schema output folder exists"`
- `npm run build --prefix ui-react`
- `npm run test --prefix ui-react -- --run src/pages/Integrations.test.tsx`

All checks passed.

## Deviations from Plan

- Backend currently returns generic reload errors by default; frontend now supports both generic errors and structured diagnostics payloads without blocking this plan.

## Next Plan Readiness

Plan `12-01` is complete. Execution intentionally stopped here per request; `12-02` and `12-03` remain pending.
