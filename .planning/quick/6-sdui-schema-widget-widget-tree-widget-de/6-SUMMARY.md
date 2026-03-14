---
phase: quick
plan: 6
status: completed
owner: codex
created_at: 2026-03-14
commit: bf8d327
---

## Objective
将 React SDUI schema 从 `widget_tree + widget_defs` 双份实体定义重构为 `$defs` 单一真源，保留 `widget_tree` 作为组合入口，并让 `widget_defs` 仅保留兼容映射。

## What Changed
- 重构 `scripts/generate_react_sdui_schema.mjs`：
  - 以 `WidgetSchema` 导出的树提取实体定义，统一输出到 `$defs`；
  - 新增 `ContainerWidget` / `PrimitiveWidget` / `Widget` 分类层，`widget_tree` 改为 `{"$ref":"#/$defs/Widget"}`；
  - 递归引用统一改写为 `#/$defs/Widget`；
  - 提取公共片段：`templatedString`、`spacingValue`、`sizeValue`、`toneValue`、`alignValue`；
  - `widget_defs` 改为兼容视图（各 widget 名称到 `$defs` 的 `$ref` 映射）。
- 增强 `scripts/generate_schemas.py`：
  - `rewrite_schema_refs` 支持 `#/$defs/* -> #/$defs/Sdui*` 命名空间重写；
  - 组合阶段优先导入 React fragment 的 `$defs`，`widget_tree` 仅作入口兜底；
  - `widget_defs` 仅在缺失时补充，不再成为第二套真源。
- 扩展 `tests/core/test_generate_schemas.py`：
  - 新增 `$defs` 单一真源 + `widget_tree` ref + `widget_defs` 兼容 ref 的组合测试；
  - 新增缺失 `$defs.Widget` 的保护性报错测试。
- 重新生成：
  - `config/schemas/integration.sdui.schema.json`
  - `config/schemas/integration.schema.json`

## Verification
- `python scripts/generate_schemas.py`
- `pytest tests/core/test_generate_schemas.py`
- `npm --prefix ui-react run test -- src/pages/Integrations.test.tsx`

## Result
- `integration.sdui.schema.json` 已实现 `$defs` 单一实体真源，`widget_tree` 保留兼容入口。
- `integration.schema.json` 的 SDUI refs 已完成 `Sdui*` 命名空间闭环，无断裂引用。
- 核心 schema 测试与 Integrations 页面回归测试均通过。
