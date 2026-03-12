---
task: quick-17
description: docs 文档重组：合并 SDUI/模板文档，拆分 flow 与 webview 子目录，重命名 UI 设计文档并精简测试文档
created: 2026-03-12
---

# Quick Plan 17

## Task 1 - 合并重复文档并补齐 SDUI
- files: `docs/view_template_configuration.md`, `docs/sdui/01_architecture_and_guidelines.md`, `docs/sdui/02_component_map_and_categories.md`, `docs/sdui/README.md`
- action: 将 `view_template_configuration` 与 SDUI 重复内容并入 SDUI 目录；补齐模板结构、数据绑定、列表布局等 SDUI 缺失点；删除冗余模板文档。
- verify: SDUI 文档可单独覆盖模板配置核心信息，且包含到表达式规范与组件字典的 markdown 交叉引用。
- done: `docs/view_template_configuration.md` 删除，SDUI 子目录具备入口文档与完整交叉引用。

## Task 2 - 重构 Flow / WebView 文档结构
- files: `docs/flow_configuration.md`, `docs/step_failure_test_inputs.md`, `docs/flow/*`, `docs/webview-scraper/*`
- action: 为 Flow 新建子目录并拆分架构、步骤参考、OAuth 专项、失败测试输入；为 WebView Scraper 新建核心能力子目录并拆分架构/运行时说明。
- verify: 旧单文件被替换为子目录结构，Flow 与 WebView 文档互相引用，OAuth 有独立说明。
- done: `docs/flow_configuration.md` 与 `docs/webview_scraper_architecture.md` 被目录化替代。

## Task 3 - UI 设计文档 rename + 测试文档精简 + 全局链接修复
- files: `docs/custom_design_prompt.md`, `docs/testing_tdd.md`, `docs/README.md`, `README.md`, `.planning/PROJECT.md`
- action: 重命名 UI 设计文档为更清晰命名；将测试文档重写为精简版；新增 docs 总览并修复 README/PROJECT 内所有相关链接。
- verify: 所有核心文档路径可被 rg 检索命中，无失效旧路径引用。
- done: 文档导航清晰、命名一致，且文档间统一使用 markdown 链接相互引用。
