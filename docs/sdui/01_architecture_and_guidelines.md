# Glanceus SDUI Architecture and Template Guidelines

## 1. Goal

Glanceus uses SDUI (Schema-Driven UI) in the view layer:
- Declare UI with YAML/JSON templates instead of hardcoding per-scenario pages.
- Renderer handles parsing/validation/fallback, not request orchestration.
- Flow owns authentication and fetching; SDUI only renders data.

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

## 3. Shared Widget Field System

Widgets share a common enum system, but not every widget exposes every field:
- `spacing`: `none` | `sm` | `md` | `lg`
- `size`: `sm` | `md` | `lg` | `xl`
- `tone`: `default` | `muted` | `info` | `success` | `warning` | `danger`
- `color`: `blue` | `orange` | `green` | `violet` | `red` | `cyan` | `amber` | `pink` | `teal` | `gold` | `slate` | `yellow`
- `align_x` / `align_y`: `start` | `center` | `end`

Color contract:
- On supported non-chart widgets, `color` overrides `tone`.
- Charts keep `colors` as the array form of the same semantic color enum.
- Do not use raw hex, CSS variables, or library-native color values in templates.

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

## 5. List, Layout, and Chart Composition

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

```yaml
- type: "Chart.Line"
  data_source: "{sql_response.rows}"
  title: "Revenue trend"
  description: "Daily SQL revenue"
  encoding:
    x:
      field: "ts"
    y:
      field: "amount"
    series:
      field: "category"
  legend: true
  colors: ["blue", "teal"]
  empty_state: "No chart data available"

- type: "Chart.Table"
  data_source: "{sql_response.rows}"
  title: "Top regions"
  encoding:
    columns:
      - field: "label"
        title: "Region"
        format: "text"
      - field: "amount"
        title: "Revenue"
        format: "number"
  sort_by: "amount"
  sort_order: "desc"
  limit: 10
```

### 5.1 Shared Chart Contract

Supported first-release chart widget types:
- `Chart.Line`
- `Chart.Bar`
- `Chart.Area`
- `Chart.Pie`
- `Chart.Table`

Shared chart props:
- `data_source`: resolved dataset, typically `sql_response.rows`
- `encoding`: channel mapping for chart fields inside the selected dataset
- `title`
- `description`
- `legend`
- `colors`: chart semantic color names only (`blue`, `orange`, `green`, `violet`, `red`, `cyan`, `amber`, `pink`, `teal`, `gold`, `slate`, `yellow`); values cycle when series exceed 12; raw hex, CSS variables, and native color values are not supported
- `format`
- `empty_state`

Per-chart required encoding channels:
- `Chart.Line` / `Chart.Bar` / `Chart.Area`: `encoding.x`, `encoding.y`, optional `encoding.series`
- `Chart.Pie`: `encoding.label`, `encoding.value`, optional `donut` (boolean)
- `Chart.Table`: `encoding.columns[*].field` references must map to dataset fields; `sort_by`, `sort_order`, and `limit` remain top-level table controls

Deterministic chart fallback states:
- `loading`
- `empty`
- `config_error`
- `runtime_error`

State precedence is fixed to: `loading -> runtime_error -> config_error -> empty -> ready`.
Invalid or empty chart widgets must degrade inside the card shell and must never white-screen the dashboard.

### 5.2 Widget Visual Baseline (Spacing and List Item)

To keep hierarchy clear, widget spacing uses two semantic levels:
- **Layout spacing** (`Container` / `ColumnSet` / `Column` / `List`): larger for structure grouping.
- **Micro spacing** (`FactSet` / `ActionSet`): tighter for compact inner content.

For the same `spacing` token: **Layout >= Micro**. Current mapping:
- Layout: `sm -> qb-gap-2`, `md -> qb-gap-3`, `lg -> qb-gap-4`
- Micro: `sm -> qb-gap-1`, `md -> qb-gap-2`, `lg -> qb-gap-3`

`List` applies lightweight item grouping borders by default for scanability:
- Recommended baseline: `rounded-md border border-border/40 bg-surface/20`
- Principle: grouping should be visible but not overpower content.

## 6. Widget Layout and Responsive Shell Contract

To support discrete grid heights without JS calculations or squashed UI, Glanceus uses a CSS Flexbox `min-height` + `flex-shrink: 0` approach.

- **Structural Widgets** (`TextBlock`, `FactSet`, etc.): Height is defined by content (`flex-none`).
- **Content Widgets** (`List`, `Chart.*`, etc.): Share remaining space based on weight, with a rigid minimum height defined in grid rows (e.g. `2` rows).

For implementation details and scroll strategies, see: [04_widget_layout_contract.md](04_widget_layout_contract.md).

## 7. Schema-First Constraints

1. Define schema first, then derive component props.
2. Run schema `safeParse` before rendering.
3. Invalid nodes must degrade gracefully, never white-screen.
4. Update SDUI docs whenever components are added/changed.

## 7. Boundary with Flow

- SDUI: presentation layer only.
- Flow: auth/fetch/extract/resume execution.
- Flow docs entry: [../flow/01_architecture_and_orchestration.md](../flow/01_architecture_and_orchestration.md)
