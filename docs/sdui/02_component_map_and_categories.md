# Glanceus SDUI Component Map and Category Dictionary

This document defines the **single source of truth** for supported SDUI components in the frontend renderer.

## 0. Template Hierarchy

- Template type: `source_card`
- Card content entry: `widgets`
- `widgets` may only use the five categories below

## 1. Layouts (Structure Containers)

- `Container`: vertical flow container for section grouping.
  - Common fields: `items`, `spacing`, `align_y`
- `ColumnSet`: horizontal column layout; direct children must be `Column`.
  - Common fields: `columns`, `spacing`, `align_x`
- `Column`: column container with `auto` / `stretch` / numeric weight width.
  - Common fields: `items`, `width`, `spacing`, `align_y`

## 2. Containers (Data Containers)

- `List` **[Content, minHeightRows: 2]**: array iterator container with filtering/sorting/pagination/layout support.

Common fields:
- `data_source`: array data path
- `item_alias`: list item alias
- `render`: child widget template per item
- `filter` / `sort_by` / `sort_order` / `limit` / `pagination` / `page_size`

## 3. Elements (Atomic Elements)

- `TextBlock` **[Structural]**: generic text element, including numeric/status text.
  - Common fields: `text`, `size`, `tone`, `align_x`, `weight`, `wrap`, `max_lines`
- `FactSet` **[Structural]**: key-value pairs (`label`/`value`).
  - Common fields: `facts`, `spacing` (`tone` can be set per fact)
- `Image` **[Structural]**: image or icon.
  - Common fields: `url`, `altText`, `size`
- `Badge` **[Structural]**: status badge.
  - Common fields: `text`, `size`, `tone`

## 4. Visualizations

- `Progress` **[Structural/Content]**: progress/quota visualization (`bar` or `ring`). behaves as structural or content depending on container constraints.
  - Common fields: `value`, `label`, `style`, `size`, `tone`, `thresholds.warning`, `thresholds.danger`
- `Chart.Line` **[Content, minHeightRows: 3]**: cartesian trend chart for ordered x/y data.
- `Chart.Bar` **[Content, minHeightRows: 3]**: cartesian comparison chart for x/y data.
- `Chart.Area` **[Content, minHeightRows: 3]**: filled cartesian trend chart for x/y data.
- `Chart.Pie` **[Content, minHeightRows: 3]**: categorical share chart for `label` + `value` data.
- `Chart.Table` **[Content, minHeightRows: 3]**: dense SQL result inspection table for selected columns.

Shared chart fields:
- `data_source`
- `encoding`
- `title`
- `description`
- `legend`
- `colors`: semantic chart color names only (`blue`, `orange`, `green`, `violet`, `red`, `cyan`, `amber`, `pink`, `teal`, `gold`, `slate`, `yellow`); values cycle when series exceed 12
- `format`
- `empty_state`

Chart-specific field rules:
- `Chart.Line` / `Chart.Bar` / `Chart.Area`: require `encoding.x` and `encoding.y`; support optional `encoding.series`
- `Chart.Pie`: requires `encoding.label` and `encoding.value`; supports optional `donut` boolean
- `Chart.Table`: requires `encoding.columns[*].field` references that resolve against dataset fields; supports `sort_by`, `sort_order`, and `limit`

Deterministic chart fallback states:
- `loading`
- `empty`
- `config_error`
- `runtime_error`

## 5. Actions

- `ActionSet` **[Structural]**: action container.
  - Common fields: `actions`, `spacing`, `align_x`
- `Action.OpenUrl` **[Structural]**: open external URL.
  - Common fields: `title`, `url`, `size`, `tone`
- `Action.Copy` **[Structural]**: copy text.
  - Common fields: `title`, `text`, `size`, `tone`

## 6. Shared Enum Fields

- `spacing`: `none` | `sm` | `md` | `lg`
- `size`: `sm` | `md` | `lg` | `xl`
- `tone`: `default` | `muted` | `info` | `success` | `warning` | `danger`
- `align_x` / `align_y`: `start` | `center` | `end`

## 7. Non-Current SDUI Components (Legacy Names)

The following names are not part of the current renderer and must not be used in new templates:
- `hero_metric`
- `progress_bar`
- `key_value_grid`
- `metric` / `table` / `json` / `stat_grid`
- legacy chart aliases such as `line_chart` and `bar_chart` must not be used; use `Chart.Line` and `Chart.Bar`

## 8. Maintenance Rules

When adding a component, update:
- `01_architecture_and_guidelines.md`
- `02_component_map_and_categories.md`
- `03_template_expression_spec.md` (if new expression fields are introduced)

Flow/OAuth/WebView are execution-layer capabilities, not SDUI widget responsibilities.
See: [../flow/02_step_reference.md](../flow/02_step_reference.md)
