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
- `color`: `blue` | `orange` | `green` | `violet` | `red` | `cyan` | `amber` | `pink` | `teal` | `gold` | `slate` | `yellow`
- `align_x` / `align_y`: `start` | `center` | `end`
- Layout size values (`width` / `height`, where exposed): `auto` | `stretch` | positive number

Avoid legacy values such as `small/default/large` or old alignment aliases.

Color rule:
- On supported non-chart widgets, `color` overrides `tone`.
- Charts keep `colors` as the array form of the same semantic color enum.

Layout size rule:
- Shared value domain is `auto` | `stretch` | positive number, but numeric meaning is field-specific.
- `Container.height` / `ColumnSet.height` and `Column.width` use flex-weight semantics for numeric values.
- `Column.height` uses fixed pixel semantics for numeric values.

## 3. Widget Catalog

### 3.1 Layout Widgets

#### `Container`
Required:
- `type: "Container"`
- `items: [Widget]`

Optional:
- `spacing`
- `align_x`
- `align_y`
- `height`: `auto` | `stretch` | positive number (default `stretch`)

#### `ColumnSet`
Required:
- `type: "ColumnSet"`
- `columns: [Column]`

Optional:
- `spacing`
- `align_x`
- `align_y`
- `height`: `auto` | `stretch` | positive number (default `stretch`)

#### `Column`
Required:
- `type: "Column"`
- `items: [Widget]`

Optional:
- `width`: `auto` | `stretch` | positive number
- `height`: `auto` | `stretch` | positive number
- `align_x`
- `align_y`
- `spacing`

Layout sizing behavior:
- `Container.height` / `ColumnSet.height`: `stretch` fills remaining vertical space; `auto` hugs content; positive number is a vertical flex weight.
- `Column.width`: `stretch` fills remaining horizontal space; positive number is a horizontal flex weight.
- `Column.height`: `stretch` fills the parent height; positive number is a fixed pixel height.
- `align_x` and `align_y` are both valid on layout widgets; for `ColumnSet`, `align_x` is the main axis, while for `Container` / `Column`, `align_y` is the main axis.

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
- `align_x`
- `align_y`
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
- `color`
- `align_x`
- `wrap`: boolean
- `max_lines`: number

#### `FactSet`
Required:
- `type: "FactSet"`
- `facts`: array of `{ label, value, tone?, color? }`

Optional:
- `spacing`
- `color`

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
- `color`
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
- `color`
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
- `fields_source`
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
- `fields_source`
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
- `fields_source`
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
- Keep chart configs parameter-driven: bind dataset via `data_source` and metadata via optional `fields_source`; do not encode fixed backend response paths as hidden assumptions.

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
- `color`

#### `Action.Copy`
Required:
- `type: "Action.Copy"`
- `title`
- `text`

Optional:
- `size`
- `tone`
- `color`

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
