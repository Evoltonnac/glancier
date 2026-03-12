---
quick_task: 9
phase: quick-9
plan: 9
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/generate_schemas.py
  - scripts/generate_react_sdui_schema.mjs
  - tests/core/test_generate_schemas.py
  - config/schemas/integration.python.schema.json
  - config/schemas/integration.sdui.schema.json
  - config/schemas/integration.schema.json
  - docs/integration.schema.json
  - .planning/quick/9-json-schema-split-generation-from-python/9-SUMMARY.md
  - .planning/STATE.md
autonomous: true
---

<objective>
将集成 YAML schema 生成改为“后端 Python + 前端 React SDUI(Zod)”分片产出，并统一落在 `config/schemas/`。Monaco 使用组合后的完整 schema 做校验；`docs/` 下旧 schema 不再作为来源。
</objective>

<tasks>

<task>
  <name>Task 1: 拆分 schema 生成管线</name>
  <files>scripts/generate_schemas.py, scripts/generate_react_sdui_schema.mjs</files>
  <action>
在 Python 脚本内分别生成 Python 片段、调用 React SDUI zod 导出片段，并组合为完整 integration schema。
  </action>
  <verify>
    <manual>运行 `python scripts/generate_schemas.py` 后，`config/schemas/` 下存在 python/sdui/full 三个 schema 文件且 JSON 可解析。</manual>
  </verify>
  <done>schema 生成流程完成拆分与组合，路径统一到 config/schemas。</done>
</task>

<task>
  <name>Task 2: 清理 docs schema 依赖</name>
  <files>docs/integration.schema.json, scripts/generate_schemas.py</files>
  <action>
移除 docs 目录下 schema 产物与写入逻辑，确保生成入口只写 config/schemas。
  </action>
  <verify>
    <manual>脚本执行后不会创建或更新 `docs/integration.schema.json`，且代码内不再指向 docs schema 目录。</manual>
  </verify>
  <done>schema 来源路径完成收敛。</done>
</task>

<task>
  <name>Task 3: 测试与回归</name>
  <files>tests/core/test_generate_schemas.py, ui-react/src/components/editor/YamlEditorWorkerSetup.ts</files>
  <action>
补充/调整测试验证分片结构与组合 schema 注入点，确认 Monaco 继续读取组合后的 `config/schemas/integration.schema.json`。
  </action>
  <verify>
    <manual>相关 pytest 通过，Monaco schema 导入路径保持 config/schemas 下完整 schema。</manual>
  </verify>
  <done>改造可回归、可维护。</done>
</task>

</tasks>

<success_criteria>
- `scripts/generate_schemas.py` 产出 Python 片段、React SDUI 片段、组合完整 schema 三份文件
- 三份文件都写入 `config/schemas/`
- `docs/integration.schema.json` 不再需要，且不再被生成流程依赖
- Monaco 校验继续使用组合后的完整 schema
</success_criteria>
