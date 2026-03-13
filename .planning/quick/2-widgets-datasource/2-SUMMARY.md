---
phase: quick
plan: 2
subsystem: ui-react
tags: [widgets, data-source, configuration]
dependency_graph:
  requires: []
  provides: [List widget flexible data_source]
  affects: [WidgetRenderer, config types]
tech_stack:
  added: [z.union for schema, union type for TypeScript]
  patterns: [runtime type checking for string vs array]
key_files:
  created: []
  modified:
    - ui-react/src/components/widgets/containers/List.tsx
    - ui-react/src/types/config.ts
    - ui-react/src/components/widgets/WidgetRenderer.tsx
decisions:
  - "Allow data_source to be either string path or inline array for simpler widget configuration"
metrics:
  duration_minutes: 2
  completed_date: "2026-03-13"
---

# Quick Task 2: Widgets DataSource Summary

## Objective

Allow widget `data_source` parameter to accept either a string path OR actual data directly (array). Purpose: Currently `data_source` only accepts string paths like `"{shots}"` which requires users to know exact data paths - error-prone. This change allows inline array data for simpler configuration.

## Completed Tasks

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Update List.tsx schema to accept string or array | 92195f5 | Complete |
| 2 | Update SduiListWidget type in config.ts | 92195f5 | Complete |
| 3 | Update WidgetRenderer to handle both string and array | 92195f5 | Complete |

## Changes Made

### 1. List.tsx Schema Update
- Changed `data_source: z.string()` to `data_source: z.union([z.string(), z.array(z.any())])`
- Enables both string path and inline array in schema validation

### 2. config.ts Type Update
- Changed `data_source: string` to `data_source: string | any[]` in SduiListWidget interface

### 3. WidgetRenderer.tsx Update
- Added runtime type checking to handle both string paths (existing behavior) and inline arrays (new feature)
- String paths are resolved via `.split(".").reduce()` as before
- Inline arrays are used directly without path resolution

## Verification

- TypeScript type check passes for all modified files
- Pre-existing unused variable warnings in Dashboard.tsx are unrelated

## Usage Examples

```typescript
// String path (existing - backward compatible)
{
  type: "List",
  data_source: "keys_list",
  item_alias: "item",
  render: [...]
}

// Inline array (new feature)
{
  type: "List",
  data_source: [
    { id: 1, name: "Item 1" },
    { id: 2, name: "Item 2" }
  ],
  item_alias: "item",
  render: [...]
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All modified files verified present and committed.
