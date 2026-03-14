---
phase: quick
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/generate_react_sdui_schema.mjs
  - scripts/generate_schemas.py
  - tests/core/test_generate_schemas.py
  - config/schemas/integration.sdui.schema.json
  - config/schemas/integration.schema.json
autonomous: true
requirements: []
---

<objective>
重构 React SDUI schema 生成与组合链路：以 `$defs` 作为 widget 单一真源，`widget_tree` 仅引用 `$defs.Widget`，`widget_defs` 退化为兼容视图（`$ref` 映射），并补齐递归与结构去重测试，确保 Monaco 使用的 composed schema 可持续工作。
</objective>

<tasks>

<task type="auto">
  <name>Task 1: 重构 React SDUI fragment 形态为 `$defs` 单一真源</name>
  <files>scripts/generate_react_sdui_schema.mjs</files>
  <action>
在生成脚本中将 widget 实体定义统一输出到 `$defs`，构建 `ContainerWidget`/`PrimitiveWidget`/`Widget` 分类层；将递归引用统一改写为 `#/$defs/Widget`；提取公共模板片段（templatedString + 常见枚举 value defs），并保留 `widget_tree` 入口为 `$ref: #/$defs/Widget`。
  </action>
  <verify>
    <automated>python scripts/generate_schemas.py</automated>
  </verify>
  <done>integration.sdui.schema.json 出现 `$defs` 单一实体定义，`widget_tree` 不再内联重复树</done>
</task>

<task type="auto">
  <name>Task 2: 组合器兼容 `$defs` 真源与 widget_defs 兼容映射</name>
  <files>scripts/generate_schemas.py, config/schemas/integration.schema.json</files>
  <action>
增强 ref 改写逻辑，支持 `#/$defs/*` -> `#/$defs/Sdui*` 命名空间迁移；优先从 React fragment 的 `$defs` 导入 Sdui defs，`widget_tree` 作为入口兜底，`widget_defs` 仅用于兼容补充，避免二次定义。
  </action>
  <verify>
    <automated>pytest tests/core/test_generate_schemas.py</automated>
  </verify>
  <done>compose 后 schema 的 SduiWidget 与相关 defs 引用闭环正确，无断裂引用</done>
</task>

<task type="auto">
  <name>Task 3: 增补语义等价/递归/去重测试</name>
  <files>tests/core/test_generate_schemas.py</files>
  <action>
增加“React `$defs` 单一真源 + `widget_tree` ref + `widget_defs` 兼容 ref”场景测试，断言 refs 正确重写、递归有效、ViewComponent widgets 入口不变。
  </action>
  <verify>
    <automated>pytest tests/core/test_generate_schemas.py</automated>
  </verify>
  <done>测试覆盖新结构并通过，确保生成链路与 UI 校验链路兼容</done>
</task>

</tasks>

<success_criteria>
- integration.sdui.schema.json 以 `$defs` 为唯一 widget 实体来源
- widget_tree 指向 `#/$defs/Widget`，递归点统一到该入口
- widget_defs 不再承载独立实体定义，仅为兼容映射
- compose 后 integration.schema.json 引用无断裂，tests/core/test_generate_schemas.py 全通过
</success_criteria>

<output>
After completion, create .planning/quick/6-sdui-schema-widget-widget-tree-widget-de/6-SUMMARY.md
</output>
