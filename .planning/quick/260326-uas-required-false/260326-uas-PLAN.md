---
phase: quick
plan: 260326-uas
type: execute
wave: 1
depends_on: []
files_modified:
  - core/steps/auth_step.py
  - core/executor.py
  - core/config_loader.py
  - config/schemas/integration.schema.json
  - config/schemas/integration.python.schema.json
  - ui-react/src/types/config.ts
  - ui-react/src/components/auth/FlowHandler.tsx
  - ui-react/src/components/auth/FlowHandler.test.tsx
  - tests/core/test_executor_auth_interactions.py
autonomous: true
requirements: []
must_haves:
  truths:
    - "当 FORM step 提供 required:false 字段且当前无值时，前端仍能看到并填写该字段。"
    - "布尔开关（switch）、单选（radio/select）、多选（multi-select）字段都能被渲染并提交。"
    - "表单字段渲染数量没有隐式上限，较大字段列表也会完整渲染。"
  artifacts:
    - path: "core/steps/auth_step.py"
      provides: "FORM 交互字段收集逻辑（包含 optional 字段）"
    - path: "ui-react/src/components/auth/FlowHandler.tsx"
      provides: "按字段类型渲染控件并构造提交 payload"
    - path: "ui-react/src/components/auth/FlowHandler.test.tsx"
      provides: "required=false 与类型渲染回归测试"
    - path: "tests/core/test_executor_auth_interactions.py"
      provides: "后端 interaction 字段完整性回归"
  key_links:
    - from: "core/steps/auth_step.py"
      to: "ui-react/src/components/auth/FlowHandler.tsx"
      via: "interaction.fields payload"
      pattern: "fields[].required/type/default/options"
    - from: "ui-react/src/components/auth/FlowHandler.tsx"
      to: "api.interact"
      via: "submit payload normalization"
      pattern: "按控件类型序列化值（boolean/string/string[]）"
---

<objective>
修复并验证交互表单渲染契约：确保 `required:false` 字段不会被遗漏，并补齐常见字段类型（布尔开关、单选、多选）的前后端支持，顺带确认不存在表单项渲染上限。
</objective>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.agents/skills/vercel-react-best-practices/SKILL.md
@core/steps/auth_step.py
@core/executor.py
@ui-react/src/components/auth/FlowHandler.tsx
@ui-react/src/components/auth/FlowHandler.test.tsx
@tests/core/test_executor_auth_interactions.py
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 固化 FORM 交互字段契约（含 required=false 与类型元数据）</name>
  <files>core/steps/auth_step.py, core/executor.py, core/config_loader.py, config/schemas/integration.schema.json, config/schemas/integration.python.schema.json</files>
  <behavior>
    - Case 1: required=true 且缺值 -> 必须进入 interaction.fields。
    - Case 2: required=false 且缺值 -> 仍进入 interaction.fields（用于可选填写），且 required 标记为 false。
    - Case 3: 字段 type/options/default 等元数据会透传给前端，不丢失。
    - Case 4: 仅 optional 缺值时也会触发表单交互，避免“字段不显示”。
  </behavior>
  <action>调整 FORM step 缺值处理逻辑：未解析到值的字段都进入 interaction payload（required 仅影响提交校验，不影响渲染）；同时在 schema 与恢复字段构建逻辑中明确支持 `switch/boolean`、`radio/select`、`multiselect` 所需元数据（例如 options、multiple）。不要引入新的交互类型，继续复用 `input_text` 与 `fields[]` 契约，保持 API 向后兼容。</action>
  <verify>
    <automated>pytest tests/core/test_executor_auth_interactions.py -k "form or required or interaction" -x</automated>
  </verify>
  <done>后端在 required=false 缺值场景也会返回可渲染字段，且字段类型/选项元数据可被前端消费。</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: FlowHandler 按字段类型渲染并提交（switch/radio/single/multi）</name>
  <files>ui-react/src/types/config.ts, ui-react/src/components/auth/FlowHandler.tsx</files>
  <behavior>
    - Case 1: required=false 字段在 UI 可见且不会阻塞提交。
    - Case 2: boolean/switch 字段可切换并提交布尔值。
    - Case 3: single-select/radio 字段可单选并提交单值。
    - Case 4: multi-select 字段可多选并提交数组值。
    - Case 5: 表单字段数量较多时全部渲染，无截断上限。
  </behavior>
  <action>扩展 InteractionField 前端类型定义（options/multiple/value_type 等必要字段），在 FlowHandler 中按 `field.type` 渲染对应控件；required 校验仅针对 required=true 字段。提交逻辑按控件类型进行序列化（保留 trim 行为用于文本输入，布尔与数组不做错误字符串化）。实现时遵循现有组件性能习惯：避免不必要 state 派生和重复渲染。</action>
  <verify>
    <automated>cd /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react && npm run test -- FlowHandler.test.tsx --runInBand</automated>
  </verify>
  <done>FlowHandler 能稳定渲染并提交文本/开关/单选/多选字段，required=false 不再“消失”。</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 回归测试覆盖“required=false + 多类型 + 无上限截断”</name>
  <files>ui-react/src/components/auth/FlowHandler.test.tsx, tests/core/test_executor_auth_interactions.py</files>
  <behavior>
    - Test 1: 后端 interaction 返回 required=false 字段并保持 required 标记。
    - Test 2: 前端渲染 required=false 字段并允许空值提交。
    - Test 3: switch/radio/single-select/multi-select 都有可执行测试样例。
    - Test 4: 构造较大字段数（例如 30+）验证全部渲染，确认不存在渲染上限。
  </behavior>
  <action>补齐前后端测试矩阵，覆盖本次新增/修复行为；用显式断言验证字段数量和 payload 结构，避免只做快照。测试命名要能直接表达“required=false 不丢字段”和“类型控件可提交”。</action>
  <verify>
    <automated>pytest tests/core/test_executor_auth_interactions.py -x && cd /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react && npm run test -- FlowHandler.test.tsx --runInBand</automated>
  </verify>
  <done>关键回归均有自动化测试保护，后续改动不会再次引入 required=false 缺失或类型渲染倒退。</done>
</task>

</tasks>

<success_criteria>
- required=false 的 FORM 字段在交互弹窗中可见并可提交。
- 布尔开关、单选、多选字段在同一交互系统中可渲染、可编辑、可提交。
- 未发现代码中的“表单项渲染上限”；并由测试对大量字段渲染建立回归保障。
- 前后端相关自动化测试通过。
</success_criteria>

<output>
After completion, create `.planning/quick/260326-uas-required-false/260326-uas-SUMMARY.md`.
</output>
