# Glanceus SDUI Component Reference (Current)

This reference documents supported SDUI widgets and fields for integration templates.

## 1. Source of Truth

Use these in priority order:
1. Renderer/schema (`ui-react/src/components/widgets/*`, `config/schemas/integration.sdui.schema.json`)
2. SDUI docs (`docs/sdui/01_architecture_and_guidelines.md`, `docs/sdui/02_component_map_and_categories.md`, `docs/sdui/03_template_expression_spec.md`)

## 2. Shared Enum Fields

Use only these values:
- `spacing`: `none` | `sm` | `md` | `lg`
- `size`: `sm` | `md` | `lg` | `xl`
- `tone`: `default` | `muted` | `info` | `success` | `warning` | `danger`
- `align_x` / `align_y`: `start` | `center` | `end`

Avoid legacy values such as `small/default/large` or old alignment aliases.

## 3. Widget Catalog

### 3.1 Layout Widgets

#### `Container`
Required:
- `type: "Container"`
- `items: [Widget]`

Optional:
- `spacing`
- `align_y`

#### `ColumnSet`
Required:
- `type: "ColumnSet"`
- `columns: [Column]`

Optional:
- `spacing`
- `align_x`

#### `Column`
Required:
- `type: "Column"`
- `items: [Widget]`

Optional:
- `width`: `auto` | `stretch` | positive number
- `align_y`
- `spacing`

### 3.2 Data Container

#### `List`
Required:
- `type: "List"`
- `data_source`: array or templated string
- `item_alias`: string
- `render: [Widget]`

Minimal valid shape:

```yaml
- type: "List"
  data_source: "{items}"
  item_alias: "item"
  render:
    - type: "TextBlock"
      text: "{item.title}"
```

Optional:
- `layout`: `col` | `grid`
- `columns`: 1..6
- `spacing`
- `filter`: expression string
- `sort_by`: string path
- `sort_order`: `asc` | `desc`
- `limit`: positive number
- `pagination`: boolean
- `page_size`: positive number

### 3.3 Atomic Elements

#### `TextBlock`
Required:
- `type: "TextBlock"`
- `text`

Optional:
- `size`
- `weight`: `normal` | `medium` | `semibold` | `bold`
- `tone`
- `align_x`
- `wrap`: boolean
- `max_lines`: number

#### `FactSet`
Required:
- `type: "FactSet"`
- `facts`: array of `{ label, value, tone? }`

Optional:
- `spacing`

#### `Image`
Required:
- `type: "Image"`
- `url`

Optional:
- `altText`
- `size`

#### `Badge`
Required:
- `type: "Badge"`
- `text`

Optional:
- `tone`
- `size`

### 3.4 Visualization

#### `Progress`
Required:
- `type: "Progress"`
- `value` (expected 0..100 semantics)

Optional:
- `label`
- `style`: `bar` | `ring`
- `size`
- `tone`
- `show_percentage`: boolean
- `thresholds.warning`
- `thresholds.danger`

#### `Chart.Line` / `Chart.Bar` / `Chart.Area`
Required:
- `type`: one of `Chart.Line`, `Chart.Bar`, `Chart.Area`
- `data_source`
- `encoding.x.field`
- `encoding.y.field`

Optional:
- `encoding.series.field`
- `title`
- `description`
- `legend`
- `colors`
- `format`
- `empty_state`
- `size`

#### `Chart.Pie`
Required:
- `type: "Chart.Pie"`
- `data_source`
- `encoding.label.field`
- `encoding.value.field`

Optional:
- `donut`: boolean
- `title`
- `description`
- `legend`
- `colors`
- `format`
- `empty_state`
- `size`

#### `Chart.Table`
Required:
- `type: "Chart.Table"`
- `data_source`
- `encoding.columns[*].field` (at least one column)

Optional:
- `encoding.columns[*].title`
- `encoding.columns[*].format`
- `sort_by`
- `sort_order`: `asc` | `desc`
- `limit`: positive number
- `title`
- `description`
- `legend`
- `colors`
- `format`
- `empty_state`
- `size`

Chart color contract:
- `colors` must use semantic names only:
  `blue`, `orange`, `green`, `violet`, `red`, `cyan`, `amber`, `pink`, `teal`, `gold`, `slate`, `yellow`.
- Do not use raw hex/CSS variable/native library color values.

### 3.5 Actions

#### `ActionSet`
Required:
- `type: "ActionSet"`
- `actions`

Optional:
- `align_x`
- `spacing`

#### `Action.OpenUrl`
Required:
- `type: "Action.OpenUrl"`
- `title`
- `url`

Optional:
- `size`
- `tone`

#### `Action.Copy`
Required:
- `type: "Action.Copy"`
- `title`
- `text`

Optional:
- `size`
- `tone`

## 4. Template Expression Rules

- Full expression: `"{...}"` keeps the original type.
- Interpolation: `"prefix {...} suffix"` stringifies expression results.
- Escape literal braces with backslash.
- Use only supported expression syntax and whitelisted helpers from SDUI expression spec.

## 5. Example (Compact source_card)

```yaml
templates:
  - id: "usage_snapshot"
    type: "source_card"
    ui:
      title: "Usage"
      icon: "📊"
    widgets:
      - type: "Container"
        spacing: "md"
        items:
          - type: "TextBlock"
            text: "{metric_value}"
            size: "xl"
            weight: "bold"
          - type: "Progress"
            value: "{usage_percent}"
            label: "Usage"
            style: "bar"
            thresholds:
              warning: 70
              danger: 90
          - type: "FactSet"
            facts:
              - label: "Signal"
                value: "{signal_label}"
```

## 6. Do and Do Not

Do:
- Keep SDUI focused on rendering Metric/Signal/Integration Data.
- Keep complex data transformation in flow (`extract`/`script`), not widget expressions.
- Prefer schema-valid, minimal widget trees.

Do not:
- Use unsupported legacy widget names (`hero_metric`, `progress_bar`, `key_value_grid`, etc.).
- Use legacy chart aliases such as `line_chart` or `bar_chart`.
- Put auth/fetch orchestration logic into templates.
- Rely on undocumented widget properties.
