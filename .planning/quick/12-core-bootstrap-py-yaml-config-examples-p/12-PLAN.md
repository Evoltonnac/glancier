---
phase: quick
plan: 12
type: execute
wave: 1
depends_on: []
files_modified:
  - core/bootstrap.py
  - core/api.py
  - ui-react/src/api/client.ts
  - ui-react/src/pages/Integrations.tsx
  - tests/core/test_bootstrap_starter_bundle.py
  - tests/core/test_app_startup_resilience.py
  - ui-react/tests/e2e/test_ui.spec.ts
  - config/examples/starter_sources.yaml
  - config/examples/starter_view.yaml
  - config/examples/integrations/*.yaml
  - config/presets/*.yaml
autonomous: true
requirements:
  - QUICK-12
---

<objective>
移除 `core/bootstrap.py` 中 starter 数据硬编码：starter 集成/source/view 从 `config/examples` YAML 加载，并复用 Python 现有 source/view 创建逻辑；同时将 integration preset 模板外置到 `config/presets` 并由前端通过后端端点加载。
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Bootstrap externalization to config/examples</name>
  <files>core/bootstrap.py, config/examples/starter_sources.yaml, config/examples/starter_view.yaml, config/examples/integrations/*.yaml</files>
  <action>
    1. 将 starter integrations/source/view 内容迁移到 `config/examples`。
    2. 重构 `seed_first_launch_workspace`：按 YAML 读取 starter 文件并执行创建，保留原有“仅 starter 工作区可重入、非 starter 跳过”判定。
  </action>
  <verify>
    <automated>pytest tests/core/test_bootstrap_starter_bundle.py -q</automated>
  </verify>
  <done>bootstrap 不再写死 starter 内容，能从 config/examples 正常加载。</done>
</task>

<task type="auto">
  <name>Task 2: Reuse existing Python source/view creation path</name>
  <files>core/api.py, core/bootstrap.py</files>
  <action>
    1. 从 `/api/sources` 与 `/api/views` 提取可复用创建函数。
    2. API 路由改为调用该函数。
    3. bootstrap 调用同一函数创建 source/view，避免并行逻辑分叉。
  </action>
  <verify>
    <automated>pytest tests/core/test_app_startup_resilience.py -q</automated>
  </verify>
  <done>source/view 创建逻辑单点复用，bootstrap 与 API 行为一致。</done>
</task>

<task type="auto">
  <name>Task 3: Externalize presets to config/presets and wire frontend</name>
  <files>core/api.py, ui-react/src/api/client.ts, ui-react/src/pages/Integrations.tsx, config/presets/*.yaml, ui-react/tests/e2e/test_ui.spec.ts</files>
  <action>
    1. 在后端新增 presets 读取端点，加载 `config/presets/*.yaml`。
    2. 前端 Integrations 页面改为调用端点获取 preset 列表与 YAML 模板内容。
    3. 保持现有按钮展示与创建行为不变。
  </action>
  <verify>
    <automated>cd ui-react && npm run typecheck</automated>
  </verify>
  <done>preset 模板从 YAML 文件驱动，UI 可正常展示和创建 integration。</done>
</task>

</tasks>

<success_criteria>
- `core/bootstrap.py` 不再包含大段 starter YAML/视图硬编码。
- starter 数据全部来自 `config/examples`。
- source/view 创建通过 API 复用函数实现。
- 四种 preset YAML 存在于 `config/presets`，前端由后端端点读取。
- 关键单测与前端类型检查通过。
</success_criteria>
