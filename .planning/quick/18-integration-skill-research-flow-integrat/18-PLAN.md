---
task: quick-18
description: 设计一个完善的 integration skill：覆盖需求 research（数据获取与鉴权方式）、flow 设计、展示模板设计、组装完整 integration yaml，并基于现有 JSON schema 校验
created: 2026-03-12
---

# Quick Plan 18

## Task 1 - 提炼集成设计知识底座（Flow + SDUI + Schema）
- files: `docs/flow/*.md`, `docs/sdui/*.md`, `config/schemas/integration*.json`, `config/integrations/*.yaml`
- action: 基于现有文档与示例，提炼可复用的 research 维度、鉴权策略矩阵、Flow step 选择规则、Template widget 选择规则、以及 integration yaml 必备结构。
- verify: 输出内容明确列出「必选字段」「可选 step/widget」「常见组合模式」「失败恢复关键点」。
- done: 在新 skill 的 references 中可直接引用上述规范，不依赖口头补充。

## Task 2 - 实现新 skill（可直接产出 integration yaml）
- files: `.agents/skills/integration-yaml-designer/**`
- action: 创建并编写新 skill，包含 SKILL.md 主流程、references 细分文档、schema 校验脚本、integration yaml scaffold 与可选模板片段。
- verify: skill 内容覆盖从需求 research -> flow 设计 -> template 设计 -> YAML 组装 -> schema 校验的端到端流程。
- done: skill 目录完整、指令可执行、且能指导产出符合当前项目约束的 integration yaml。

## Task 3 - 校验与交付（含讨论决策点）
- files: `.agents/skills/integration-yaml-designer/**`, `.planning/quick/18-integration-skill-research-flow-integrat/18-SUMMARY.md`
- action: 运行 skill 结构校验与示例 schema 校验，整理设计决策点（需要你确认）并生成 quick summary。
- verify: 校验命令成功，summary 记录产物、验证方式、以及待确认点。
- done: 提供可继续讨论并迭代的第一版完整 skill 方案。
