---
quick_task: 7
phase: quick-7
plan: 7
type: execute
wave: 1
depends_on: []
files_modified:
  - ui-react/src/index.css
  - docs/custom_design_prompt.md
autonomous: true
---

<objective>
实现 UI 全局隐藏原生滚动条，同时保留 Monaco Editor 的滚动体验；并将该约束补充进设计规范，确保后续实现一致。
</objective>

<tasks>

<task>
  <name>Task 1: 实现全局原生滚动条隐藏规则并为 Monaco 保留例外</name>
  <files>ui-react/src/index.css</files>
  <action>
在全局样式中新增原生滚动条隐藏规则（Firefox / WebKit / Legacy Edge），作用于应用容器；并为 `.monaco-editor` 区域增加例外恢复规则，避免编辑器滚动能力退化。
  </action>
  <verify>
    <automated>npm --prefix ui-react run typecheck</automated>
  </verify>
  <done>应用中常规滚动容器不再显示原生滚动条，Monaco 编辑器滚动条保持可用。</done>
</task>

<task>
  <name>Task 2: 补充设计规范中的滚动条约束</name>
  <files>docs/custom_design_prompt.md</files>
  <action>
在设计规范中新增明确规则：默认隐藏全局原生滚动条，仅 Monaco Editor 允许显示编辑器滚动条，避免规范与实现偏差。
  </action>
  <verify>
    <manual>检查文档中规则描述与样式实现一致且可检索。</manual>
  </verify>
  <done>团队可在设计规范中直接看到该约束并按此执行。</done>
</task>

</tasks>

<success_criteria>
- UI 中非 Monaco 区域原生滚动条默认隐藏
- Monaco Editor 滚动条可见且不影响编辑体验
- 设计规范已包含该规则并可作为后续开发依据
</success_criteria>
