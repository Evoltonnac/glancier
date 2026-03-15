# Glancier SDUI Component Map and Category Dictionary

This document defines the **single source of truth** for supported SDUI components in the frontend renderer.
Template structure: [01_architecture_and_guidelines.md](./01_architecture_and_guidelines.md)
Expression syntax: [03_template_expression_spec.md](./03_template_expression_spec.md)

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

- `List`: array iterator container with filtering/sorting/pagination/layout support.

Common fields:
- `data_source`: array data path
- `item_alias`: list item alias
- `render`: child widget template per item
- `filter` / `sort_by` / `sort_order` / `limit` / `pagination` / `page_size`

## 3. Elements (Atomic Elements)

- `TextBlock`: generic text element, including numeric/status text.
  - Common fields: `text`, `size`, `tone`, `align_x`, `weight`, `wrap`, `max_lines`
- `FactSet`: key-value pairs (`label`/`value`).
  - Common fields: `facts`, `spacing` (`tone` can be set per fact)
- `Image`: image or icon.
  - Common fields: `url`, `altText`, `size`
- `Badge`: status badge.
  - Common fields: `text`, `size`, `tone`

## 4. Visualizations

- `Progress`: progress/quota visualization (`bar` or `ring`).
  - Common fields: `value`, `label`, `style`, `size`, `tone`, `thresholds.warning`, `thresholds.danger`

## 5. Actions

- `ActionSet`: action container.
  - Common fields: `actions`, `spacing`, `align_x`
- `Action.OpenUrl`: open external URL.
  - Common fields: `title`, `url`, `size`, `tone`
- `Action.Copy`: copy text.
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
- `metric` / `line_chart` / `bar_chart` / `table` / `json` / `stat_grid`

## 8. Maintenance Rules

When adding a component, update all of:
- [01_architecture_and_guidelines.md](./01_architecture_and_guidelines.md)
- [02_component_map_and_categories.md](./02_component_map_and_categories.md)
- [03_template_expression_spec.md](./03_template_expression_spec.md) if new expression fields are introduced

Flow/OAuth/WebView are execution-layer capabilities, not SDUI widget responsibilities.
See: [../flow/README.md](../flow/README.md)
