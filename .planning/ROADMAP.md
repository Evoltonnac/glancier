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
  - **Plans:** 6 plans
    - [x] 11-01-PLAN.md — Backend pytest baseline, fixtures/factories, and TDD policy
    - [x] 11-02-PLAN.md — Frontend Vitest baseline, shared mocks, and harness smoke tests
    - [ ] 11-03-PLAN.md — Backend release-blocking auth/state/encryption/API tests (TDD)
    - [ ] 11-04-PLAN.md — WidgetRenderer + micro-component behavior tests (TDD)
    - [ ] 11-05-PLAN.md — Integrations flow + dashboard `x/y/w/h` non-overlap tests (TDD)
    - [ ] 11-06-PLAN.md — Local quality gates, CI blocking workflow, and minimal smoke/UAT
- [ ] **Phase 12: 错误暴露与展示增强 (Error Surfacing & Visibility)**
  - 核心目标：确保关键 Flow 的错误可以被完整暴露、正确归因，并在 UI 中可定位展示。
  - 认证 Flow 覆盖 OAuth 报错、WebScrap 报错、WebScraper `403`、非登录状态触发 cURL/CYL 报错。
  - 集成面板配置异常对齐 `.planning/quick/1-integration-editor/1-PLAN.md`：侧边栏状态、详情区、Monaco markers 三处联动。
  - 数据源 Flow 的普通 Pattern 步骤（如 Fetch、脚本操作）报错需标准化透传与展示。
  - **Plans:** 3 plans
    - [x] 12-01-PLAN.md — JSON Schema Generation & Monaco YAML Integration
    - [x] 12-02-PLAN.md — Flow Execution Fail-Fast & Error UI
    - [ ] 12-03-PLAN.md — Interactive Step States & WebScraper Foregrounding
- [ ] **Phase 13: Release v1.0 稳定版发版 (Build & Release)**
  - 核心目标：完成端到端打磨，交付可直接对外展示的安全、流畅的客户端。
  - 核心流程端到端 (E2E) 验证。
  - CI/CD GitHub Actions 配置。
## Phase Details

### Phase 10: 代码语义更新与组件重构 (Codebase Semantic Update)
- 核心目标：将设计理念落实到代码库，消除项目中的“技术债”与“命名债”。
- 品牌更名，ICON/品牌色更新，全局变量与配置更名。
- 梳理 React 组件，抽象业务组件，优化顶栏与侧边栏。

### Phase 11: 测试覆盖与 TDD 规范确立 (Test Coverage & TDD)
- 核心目标：为 1.0 稳定版保驾护航，建立一套可持续集成的现代测试流程。
- 明确 TDD 规范，增加后端（Flow/状态机/加密层）与前端（核心组件）测试。
- 执行波次：
  - Wave 1: 11-01, 11-02
  - Wave 2: 11-03, 11-04, 11-05
  - Wave 3: 11-06

### Phase 12: 错误暴露与展示增强 (Error Surfacing & Visibility)
- 核心目标：确保关键 Flow 的错误可以被完整暴露、正确归因，并在 UI 中可定位展示。
- 认证 Flow 覆盖 OAuth 报错、WebScrap 报错、WebScraper `403`、非登录状态触发 cURL/CYL 报错。
- 集成面板配置异常对齐 `.planning/quick/1-integration-editor/1-PLAN.md`，完成侧边栏状态、详情区、Monaco markers 的联动展示。
- 数据源 Flow 普通 Pattern 步骤（Fetch、脚本操作等）错误实现统一结构化返回与前端可视化。

### Phase 13: Release v1.0 稳定版发版 (Build & Release)
- 核心目标：完成端到端打磨，交付可直接对外展示的安全、流畅的客户端。
- 核心流程端到端 (E2E) 验证。
- CI/CD GitHub Actions 配置。
- 性能与安全审计。
