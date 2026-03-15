# Glancier SDUI Architecture and Template Guidelines

## 1. Goal

Glancier uses SDUI (Schema-Driven UI) in the view layer:
- Declare UI with YAML/JSON templates instead of hardcoding per-scenario pages.
- Renderer handles parsing/validation/fallback, not request orchestration.
- Flow owns authentication and fetching; SDUI only renders data.

Related docs:
- [Component Map and Categories](./02_component_map_and_categories.md)
- [Template Expression Spec](./03_template_expression_spec.md)
- [Flow Docs Entry](../flow/README.md)

## 2. Template Structure (`templates`)

Each integration can define multiple templates. Current primary template type: `source_card`.

```yaml
templates:
  - id: "template_usage"
    type: "source_card"
    ui:
      title: "Usage"
      icon: "📊"
    widgets:
      - type: "Container"
        items:
          - type: "TextBlock"
            text: "{balance}"
            size: "xl"
            weight: "bold"
          - type: "Progress"
            value: "{usage_percent}"
            label: "Usage"
```

Field meanings:
- `id`: unique template identifier
- `type`: template type (`source_card` for now)
- `ui`: card-level metadata (`title`, `icon`, ...)
- `widgets`: SDUI widget tree entry

## 3. Shared Widget Props

All widgets expose a minimal common prop model:
- `spacing`: `none` | `sm` | `md` | `lg`
- `size`: `sm` | `md` | `lg` | `xl`
- `tone`: `default` | `muted` | `info` | `success` | `warning` | `danger`
- `align_x` / `align_y`: `start` | `center` | `end`

Constraints:
- Legacy values are not supported (`small/default/large`, `compact/relaxed`, etc.).
- Visual details (padding/radius/complex style variants) stay in project UI, not templates.

> **SDUI component coding rule**: use CSS variables for all spacing (`gap`, `padding`, `margin`); avoid hardcoded pixels.
> Provided variables:
> - `--qb-gap-1` ~ `--qb-gap-6`: 2px ~ 20px (density-responsive via `--qb-density`)
> - `--qb-card-pad-x` / `--qb-card-pad-y`: card padding
> - `--qb-grid-gap`: grid spacing
>
> Example: `className="gap-[var(--qb-gap-3)]"` or `style={{ padding: 'var(--qb-card-pad-y) var(--qb-card-pad-x)' }}`

## 4. Template Binding Syntax

### 4.1 Direct Value Binding

If a field is a full expression `"{...}"`, keep original type:
- `value: "{quota_percent}"` -> number
- `show: "{quota_percent > 80}"` -> boolean

### 4.2 String Interpolation

Expressions embedded in strings are stringified and concatenated:
- `text: "Usage: {used}/{limit}"`

### 4.2.1 Escaping

To output literal template markers, use backslash escapes:
- `\{` / `\}` -> `{` / `}`
- `\\` -> `\`
- In YAML double-quoted strings, write `\\{` / `\\}` / `\\\\`

### 4.3 Expression Safety Boundary

- Only whitelisted syntax/functions are allowed.
- Arbitrary code execution is forbidden.
- Parse failures degrade to empty values without breaking card rendering.

Full rules: [03_template_expression_spec.md](./03_template_expression_spec.md)

## 5. List and Layout Composition

```yaml
- type: "List"
  data_source: "keys"
  item_alias: "key_item"
  layout: "col"
  filter: "key_item.active == true"
  sort_by: "key_item.usage"
  sort_order: "desc"
  render:
    - type: "TextBlock"
      text: "{key_item.name}"
      weight: "semibold"
    - type: "Progress"
      value: "{key_item.percent}"
      label: "Usage"
```

Component responsibilities: [02_component_map_and_categories.md](./02_component_map_and_categories.md)

### 5.1 Widget Visual Baseline (Spacing and List Item)

To keep hierarchy clear, widget spacing uses two semantic levels:
- **Layout spacing** (`Container` / `ColumnSet` / `Column` / `List`): larger for structure grouping.
- **Micro spacing** (`FactSet` / `ActionSet`): tighter for compact inner content.

For the same `spacing` token: **Layout >= Micro**. Current mapping:
- Layout: `sm -> qb-gap-2`, `md -> qb-gap-3`, `lg -> qb-gap-4`
- Micro: `sm -> qb-gap-1`, `md -> qb-gap-2`, `lg -> qb-gap-3`

`List` applies lightweight item grouping borders by default for scanability:
- Recommended baseline: `rounded-md border border-border/40 bg-surface/20`
- Principle: grouping should be visible but not overpower content.

## 6. Schema-First Constraints

1. Define schema first, then derive component props.
2. Run schema `safeParse` before rendering.
3. Invalid nodes must degrade gracefully, never white-screen.
4. Update SDUI docs whenever components are added/changed.

## 7. Boundary with Flow

- SDUI: presentation layer only.
- Flow: auth/fetch/extract/resume execution.
- Flow docs entry: [../flow/README.md](../flow/README.md)
