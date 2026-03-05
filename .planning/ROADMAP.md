# Roadmap: Glancier (formerly Quota Board)

## Overview
This roadmap manages the delivery path for Glancier. Completed milestones are archived for historical reference.

## Milestones

- [x] **v0.1: MVP Foundation & UI Refactoring** — [[Archived Roadmap](.planning/milestones/v0.1-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v0.1-REQUIREMENTS.md)]
- [ ] **v1.0: 跃迁 —— Glancier 正式版发布计划**

## Active Phases

- [x] **Phase 09: 品牌与精神重塑 (Rebranding & Documentation)**
  - 核心目标：清理旧有心智模型，确立新的术语标准并体现在文档中。
  - 取消 Quota 的狭隘定义，重构为 Metric、Signal 或 Integration Data。
  - 重写架构说明、PROJECT.md 和 README.md。
  - **Plans:** 4 plans
    - [x] 09-01-PLAN.md — Establish terminology definitions and update AI instructions
    - [x] 09-02-PLAN.md — Update core project positioning docs (README, PROJECT)
    - [x] 09-03-PLAN.md — Update architecture and configuration semantics
    - [x] 09-04-PLAN.md — Scrub deep-dive documentation for legacy terminology
- [ ] **Phase 10: 代码语义更新与组件重构 (Codebase Semantic Update)**
  - 核心目标：将设计理念落实到代码库，消除项目中的“技术债”与“命名债”。
  - 品牌更名，ICON/品牌色更新，全局变量与配置更名。
  - 梳理 React 组件，抽象业务组件，优化顶栏与侧边栏。
- [ ] **Phase 11: 测试覆盖与 TDD 规范确立 (Test Coverage & TDD)**
  - 核心目标：为 1.0 稳定版保驾护航，建立一套可持续集成的现代测试流程。
  - 明确 TDD 规范，增加后端（Flow/状态机/加密层）与前端（核心组件）测试。
- [ ] **Phase 12: Release v1.0 稳定版发版 (Build & Release)**
  - 核心目标：完成端到端打磨，交付可直接对外展示的安全、流畅的客户端。
  - 核心流程端到端 (E2E) 验证。
  - CI/CD GitHub Actions 配置。
  - 性能与安全审计。
