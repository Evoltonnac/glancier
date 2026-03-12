---
quick_task: 8
phase: quick-8
plan: 8
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/8-python-react-tauri/8-SUMMARY.md
  - .planning/STATE.md
autonomous: true
---

<objective>
快速梳理当前 Python / React / Tauri 的目录嵌套、脚本指令与构建产物路径现状，明确混乱点，并给出可落地的重构建议（先建议，不直接大改代码）。
</objective>

<tasks>

<task>
  <name>Task 1: 盘点三层工程与产物落点现状</name>
  <files>README.md, scripts/build.sh, ui-react/package.json, ui-react/src-tauri/tauri.conf.json, .gitignore, ui-react/src-tauri/.gitignore</files>
  <action>
读取并归纳 Python 后端、React 前端、Tauri 桌面壳的入口目录、构建目录、运行目录和发布目录，输出当前路径矩阵。
  </action>
  <verify>
    <manual>路径矩阵覆盖 dev/build/release 三类流程，且每类至少包含 1 个真实脚本或配置依据。</manual>
  </verify>
  <done>形成可追溯的“现状快照”，便于讨论改造边界。</done>
</task>

<task>
  <name>Task 2: 定位混乱根因（目录、命令、忽略规则）</name>
  <files>scripts/build.sh, ui-react/package.json, .gitignore, ui-react/src-tauri/binaries/README.md</files>
  <action>
分析脚本入口分散、产物目录跨层回写、ignore 规则不一致等问题，给出风险说明与影响范围。
  </action>
  <verify>
    <manual>每个问题点都能关联到具体文件或命令，不给抽象结论。</manual>
  </verify>
  <done>明确“为什么现在会乱”，并可用于后续拆分任务。</done>
</task>

<task>
  <name>Task 3: 产出分阶段整改建议</name>
  <files>.planning/quick/8-python-react-tauri/8-SUMMARY.md</files>
  <action>
给出短期（不改架构）和中期（目录重组）两档建议，包含命令收口、产物统一、文档契约、ignore 治理与迁移顺序。
  </action>
  <verify>
    <manual>建议项具备执行顺序与预期收益，且不依赖一次性大迁移。</manual>
  </verify>
  <done>用户可直接按建议拆成后续 phase 或 quick tasks。</done>
</task>

</tasks>

<success_criteria>
- 给出 Python/React/Tauri 的现状路径矩阵（入口、脚本、产物）
- 至少识别 4 个导致混乱的具体问题点并标注证据
- 输出可执行的短期/中期整改建议与优先级
</success_criteria>
