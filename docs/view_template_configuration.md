# Glancier View Template Configuration Guide

This document describes how to configure the visual presentation (Views) of your integrations in **Glancier**. The UI configuration enables you to compose data fetched from sources into rich, organized, and interactive dashboard cards.

## Overview

The view configuration is contained within the `templates` array of an integration's YAML file. Each template defines a specific presentation format, primarily as a `source_card` (or **Bento Card**) containing various `widgets`.

## Template Syntax

All fields within widget configurations that need to display dynamic data must use the template syntax. This allows for both direct data binding and string interpolation.

*   **Syntax:** Enclose the data path in curly braces `{}`. Provide the path matching the output of your integration's extraction steps.
*   **Direct Value:** If a field is exactly `"{path.to.value}"`, it will be replaced by the typed value (e.g., number, boolean) from the data.
*   **Interpolation:** If a field is a string containing templates like `"Usage: {path.to.value} units"`, it will be evaluated into a final string.
*   **Expressions:** Template blocks support common expressions, e.g.:
    *   `"{fixed((usage ?? 0), 2)}"`
    *   `"{usage > 80 ? 'High' : 'Normal'}"`
*   **Expression Specification:** See `sdui/03_template_expression_spec.md` for the full syntax, operators, helper functions, and safety boundaries.

### Examples

*   `amount: "{credits_data.remaining}"` (Evaluates to the numeric value of remaining credits)
*   `title: "Model: {key_item.model_name}"` (Evaluates to a string with the model name injected)

## Layout & Grids

Widgets within a card or a list are arranged using predefined layouts. This follows a modular **Bento Grid** approach.

### Internal Item Grid Config (`grid_template_areas`)

You can define internal custom layouts for components rendered *inside* a list item.

```yaml
widgets:
  - type: "list"
    data_source: "keys_list"
    item_alias: "key_item"
    layout: "col"
    layout_config:
      grid_template_areas:
        - "key_value progress"
      grid_template_columns: "1fr 3fr"
    render:
      - type: "progress_bar"
        area: "progress"
        title: "Usage Limit"
        usage: "{key_item.usage}"
        limit: "{key_item.limit}"
      - type: "key_value_grid"
        area: "key_value"
        items:
          "Key Name": "{key_item.name}"
```

## Available Micro-Widgets

### `hero_metric`
Highlights a single, critical numeric **Metric**.

### `TextBlock`
Universal text widget for labels, annotations, and metrics.
- `maxLines` / `max_lines`: clamps long text to `n` lines.

### `progress_bar`
A linear progress bar showing usage against a limit.
*   `title`: The title of the bar.
*   `usage`: The current usage value.
*   `limit`: The maximum limit value.
*   `color_thresholds`: Optional map of `warning_percent` and `critical_percent`.

### `key_value_grid`
A condensed grid for displaying properties.

---

## Full Example

```yaml
templates:
  - id: "template_my_metrics"
    type: "source_card"
    ui:
      title: "Platform Usage"
      icon: "🚀"
    widgets:
      - type: "hero_metric"
        amount: "{account.balance}"
        currency: "USD"
      
      # A list of active keys
      - type: "list"
        data_source: "api_keys"
        item_alias: "key"
        filter: "key.active == true"
        sort_by: "key.used"
        sort_order: "desc"
        limit: 5
        layout_config:
          grid_template_areas:
            - "stats progress"
          grid_template_columns: "1fr 2fr"
        render:
          - type: "progress_bar"
            area: "progress"
            usage: "{key.used}"
            limit: "{key.limit}"
          - type: "key_value_grid"
            area: "stats"
            items:
              "Name": "{key.name}"
              "ID": "{key.id}"
```
