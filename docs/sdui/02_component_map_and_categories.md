# Glancier SDUI 组件地图与分类字典

本文档定义当前前端渲染器支持的 **唯一** SDUI 组件集合。模板结构见 [01_architecture_and_guidelines.md](./01_architecture_and_guidelines.md)，表达式语法见 [03_template_expression_spec.md](./03_template_expression_spec.md)。

## 0. 模板层级

- 模板类型：`source_card`
- 卡片内容入口：`widgets`
- `widgets` 仅允许使用下方 5 类组件

## 1. Layouts（结构容器）

- `Container`：垂直流式容器，负责纵向分组。
  - 常用字段：`items`、`spacing`、`align_y`
- `ColumnSet`：横向分栏容器，仅可直接包含 `Column`。
  - 常用字段：`columns`、`spacing`、`align_x`
- `Column`：列容器，支持 `auto` / `stretch` / 数字权重宽度。
  - 常用字段：`items`、`width`、`spacing`、`align_y`

## 2. Containers（数据容器）

- `List`：数组迭代容器，支持筛选、排序、分页与网格布局。

常用字段：
- `data_source`：数组数据路径
- `item_alias`：列表项别名
- `render`：每个列表项的子组件模板
- `filter` / `sort_by` / `sort_order` / `limit` / `pagination` / `page_size`

## 3. Elements（原子图元）

- `TextBlock`：通用文本（含数字/状态文本）。
  - 常用字段：`text`、`size`、`tone`、`align_x`、`weight`、`wrap`、`maxLines`
- `FactSet`：键值集合（label/value）。
  - 常用字段：`facts`、`spacing`（单个 fact 可用 `tone`）
- `Image`：图片或图标。
  - 常用字段：`url`、`altText`、`size`
- `Badge`：状态徽标。
  - 常用字段：`text`、`size`、`tone`

## 4. Visualizations（可视化图元）

- `Progress`：进度/配额可视化，支持 `bar` 与 `ring`。
  - 常用字段：`value`、`label`、`style`、`size`、`tone`、`thresholds.warning`、`thresholds.danger`

## 5. Actions（交互图元）

- `ActionSet`：动作容器。
  - 常用字段：`actions`、`spacing`、`align_x`
- `Action.OpenUrl`：打开外部链接。
  - 常用字段：`title`、`url`、`size`、`tone`
- `Action.Copy`：复制文本。
  - 常用字段：`title`、`text`、`size`、`tone`

## 6. 通用字段枚举

- `spacing`: `none` | `sm` | `md` | `lg`
- `size`: `sm` | `md` | `lg` | `xl`
- `tone`: `default` | `muted` | `info` | `success` | `warning` | `danger`
- `align_x` / `align_y`: `start` | `center` | `end`

## 7. 非当前 SDUI 组件（历史定义）

以下命名不属于当前前端 SDUI 渲染集合，不应继续用于新模板：
- `hero_metric`
- `progress_bar`
- `key_value_grid`
- `metric` / `line_chart` / `bar_chart` / `table` / `json` / `stat_grid`

## 8. 维护规则

- 新增组件时，必须同时更新：
  - [01_architecture_and_guidelines.md](./01_architecture_and_guidelines.md)
  - [02_component_map_and_categories.md](./02_component_map_and_categories.md)
  - [03_template_expression_spec.md](./03_template_expression_spec.md)（若引入新表达式字段）
- Flow/OAuth/WebView 属于执行层能力，不在 SDUI 组件内实现，见 [../flow/README.md](../flow/README.md)。
