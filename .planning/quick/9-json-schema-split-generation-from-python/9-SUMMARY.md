---
phase: quick
plan: 9
subsystem: schema

tech_stack:
  added:
    - node: esbuild runtime bundling for schema extraction
  patterns:
    - split schema generation
    - schema composition
    - cross-language contract (python + react zod)
key_files:
  created:
    - scripts/generate_react_sdui_schema.mjs
    - config/schemas/integration.python.schema.json
    - config/schemas/integration.sdui.schema.json
    - .planning/quick/9-json-schema-split-generation-from-python/9-PLAN.md
    - .planning/quick/9-json-schema-split-generation-from-python/9-SUMMARY.md
  modified:
    - scripts/generate_schemas.py
    - tests/core/test_generate_schemas.py
    - config/schemas/integration.schema.json
  removed:
    - docs/integration.schema.json
metrics:
  completed_at: "2026-03-10T15:00:00Z"
---

# Quick 9 Summary: JSON Schema split generation (Python + React SDUI)

## What changed

1. `scripts/generate_schemas.py` was refactored to generate three outputs in `config/schemas/`:
   - `integration.python.schema.json`
   - `integration.sdui.schema.json`
   - `integration.schema.json` (composed full schema)
2. Added `scripts/generate_react_sdui_schema.mjs`:
   - Bundles a temporary TypeScript entry with `esbuild`
   - Reads existing React SDUI zod schemas
   - Emits JSON schema fragment consumed by Python composer
3. Composed schema now injects SDUI widget validation into `ViewComponent.widgets` via:
   - `items: { "$ref": "#/$defs/SduiWidget" }`
   - Recursive refs from zod output rewritten from `#` to `#/$defs/SduiWidget`
4. Removed obsolete docs-level schema artifact:
   - `docs/integration.schema.json`

## Monaco validation path

Monaco remains on `config/schemas/integration.schema.json`, which is now the composed full schema (Python + SDUI), satisfying the new validation contract.

## Verification

- Ran: `python scripts/generate_schemas.py`
- Ran: `pytest tests/core/test_generate_schemas.py`
- Result: `4 passed`

## Deviations from plan

- None.
