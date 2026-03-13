---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - ui-react/src/components/widgets/containers/List.tsx
  - ui-react/src/types/config.ts
  - ui-react/src/components/widgets/WidgetRenderer.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Users can use data_source as inline array (not just string path)"
    - "String path resolution still works for backward compatibility"
    - "Type definitions reflect both string and array support"
  artifacts:
    - path: "ui-react/src/components/widgets/containers/List.tsx"
      provides: "List widget with flexible data_source (string or array)"
      contains: "z.union([z.string(), z.array(z.any())])"
    - path: "ui-react/src/types/config.ts"
      provides: "TypeScript type for SduiListWidget"
      contains: "data_source: string | any[]"
    - path: "ui-react/src/components/widgets/WidgetRenderer.tsx"
      provides: "Runtime resolution of data_source (string path or array)"
---

<objective>
Allow widget `data_source` parameter to accept either a string path OR actual data directly (array).

Purpose: Currently `data_source` only accepts string paths like `"{shots}"` which requires users to know exact data paths - error-prone. This change allows inline array data for simpler configuration.
Output: Updated List widget with flexible data_source support.
</objective>

<execution_context>
@/Users/xingminghua/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@ui-react/src/components/widgets/containers/List.tsx (current data_source: z.string())
@ui-react/src/types/config.ts (SduiListWidget.data_source: string)
@ui-react/src/components/widgets/WidgetRenderer.tsx (lines 127-130: dataSource resolution via .split(".").reduce())

Current behavior:
- data_source: "keys_list" resolves via path.split(".").reduce()
- No support for inline array data
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update List.tsx schema to accept string or array</name>
  <files>ui-react/src/components/widgets/containers/List.tsx</files>
  <action>
Update the ListSchema to allow data_source to be either a string path OR an inline array:

```typescript
// Change from:
data_source: z.string(),

// To:
data_source: z.union([z.string(), z.array(z.any())]),
```

This allows users to either:
- Use string path: data_source: "keys_list" (existing)
- Use inline array: data_source: [{ id: 1, name: "test" }] (new)
  </action>
  <verify>
<automated>cd ui-react && npm run typecheck 2>&1 | head -20</automated>
  </verify>
  <done>ListSchema accepts both string and array for data_source</done>
</task>

<task type="auto">
  <name>Task 2: Update SduiListWidget type in config.ts</name>
  <files>ui-react/src/types/config.ts</files>
  <action>
Update the SduiListWidget interface to reflect the schema change:

```typescript
// Change from:
data_source: string;

// To:
data_source: string | any[];
```
  </action>
  <verify>
<automated>cd ui-react && npm run typecheck 2>&1 | head -20</automated>
  </verify>
  <done>TypeScript type supports string | any[] for data_source</done>
</task>

<task type="auto">
  <name>Task 3: Update WidgetRenderer to handle both string and array</name>
  <files>ui-react/src/components/widgets/WidgetRenderer.tsx</files>
  <action>
Update the ListWidgetRenderer to handle both string path and inline array:

```typescript
// Current (lines 127-130):
const dataSource = widget.data_source
    .split(".")
    .reduce((obj: any, key: string) => obj?.[key], data);

// Change to:
let dataSource: any;
if (typeof widget.data_source === "string") {
    // String path: resolve from data context (existing behavior)
    dataSource = widget.data_source
        .split(".")
        .reduce((obj: any, key: string) => obj?.[key], data);
} else if (Array.isArray(widget.data_source)) {
    // Inline array: use directly (new feature)
    dataSource = widget.data_source;
} else {
    dataSource = [];
}
```
  </action>
  <verify>
<automated>cd ui-react && npm run typecheck 2>&1 | head -20</automated>
  </verify>
  <done>WidgetRenderer correctly handles both string path and inline array</done>
</task>

</tasks>

<verification>
- [ ] TypeScript type check passes
- [ ] Schema validation accepts both string and array
- [ ] Runtime resolves string paths correctly (backward compatible)
- [ ] Runtime uses inline arrays directly when provided
</verification>

<success_criteria>
Widget configuration now supports:
- `data_source: "keys_list"` (string path - backward compatible)
- `data_source: [{ id: 1, name: "test" }]` (inline array - new)
</success_criteria>

<output>
After completion, create `.planning/quick/2-widgets-datasource/2-SUMMARY.md`
</output>
