# Roadmap: Glancier

## Overview
This roadmap manages the delivery path for Glancier. Completed milestones are archived for historical reference.

## Milestones

- [x] **v0.1: MVP Foundation & UI Refactoring** — [[Archived Roadmap](.planning/milestones/v0.1-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v0.1-REQUIREMENTS.md)]
- [ ] **v1.0: 跃迁 —— Glancier 正式版发布计划**

## Active Phases

- [x] **Phase 09: 品牌与精神重塑 (Rebranding & Documentation)**
  - 核心目标：清理旧有心智模型，确立新的术语标准并体现在文档中。
  - 统一术语定义为 Metric、Signal 与 Integration Data。
  - 重写架构说明、PROJECT.md 和 README.md。
  - **Plans:** 4 plans
    - [x] 09-01-PLAN.md — Establish terminology definitions and update AI instructions
    - [x] 09-02-PLAN.md — Update core project positioning docs (README, PROJECT)
    - [x] 09-03-PLAN.md — Update architecture and configuration semantics
    - [x] 09-04-PLAN.md — Scrub deep-dive documentation for outdated terminology
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
- [x] **Phase 12: 错误暴露与展示增强 (Error Surfacing & Visibility)**
  - 核心目标：确保关键 Flow 的错误可以被完整暴露、正确归因，并在 UI 中可定位展示。
  - 认证 Flow 覆盖 OAuth 报错、WebScrap 报错、WebScraper `403`、非登录状态触发 cURL/CYL 报错。
  - 集成面板配置异常对齐 `.planning/quick/1-integration-editor/1-PLAN.md`：侧边栏状态、详情区、Monaco markers 三处联动。
  - 数据源 Flow 的普通 Pattern 步骤（如 Fetch、脚本操作）报错需标准化透传与展示。
  - **Plans:** 3 plans
    - [x] 12-01-PLAN.md — JSON Schema Generation & Monaco YAML Integration
    - [x] 12-02-PLAN.md — Flow Execution Fail-Fast & Error UI
    - [x] 12-03-PLAN.md — Interactive Step States & WebScraper Foregrounding
- [ ] **Phase 13: Release v1.0 稳定版发版 (Build & Release)**
  - 核心目标：完成端到端打磨，交付可直接对外展示的安全、流畅的客户端。
  - 核心流程端到端 (E2E) 验证。
  - CI/CD GitHub Actions 配置。
- [x] **Phase 14: v1.0 发布前细节加固 (Pre-release Hardening)**
  - 核心目标：在正式发布前消除破坏性设计隐患，补齐预置配置、完整性审计与交互细节。
  - 检查未来迭代中可能触发破坏性改动的缺陷和兼容风险。
  - 固化 4 种 Integration Preset，并提供可用初始配置 + 数据源 + 看板。
  - 完成文档/代码完整性检查及 UI/交互细节补全。
  - **Plans:** 5 plans
    - [x] 14-01-PLAN.md — Breaking-change risk audit and schema convergence strategy
    - [x] 14-02-PLAN.md — Four integration presets and runnable starter bundle
    - [x] 14-03-PLAN.md — UI and interaction polish completion
    - [x] 14-04-PLAN.md — Implement built-in generalized micro-components
    - [x] 14-05-PLAN.md — Step modularization + documentation and code integrity verification
- [ ] **Phase 15: OAuth 架构重构与多流支持 (Authlib 集成)**
  - 核心目标：引入专业库规范化 OAuth 实现，支持多种现代授权流并提供一致的 UI 交互。
  - 实现授权码流 + PKCE、设备流 (RFC 8628)、隐式流及客户端凭证流。
  - 前端抽象设备授权面板 (Device Modal) 与统一回调拦截器。
  - 完善 Tauri 视角的 API 设计与 Python 后端 Authlib 深度整合。
  - **Plans:** 5 plans
    - [x] 15-01-PLAN.md — Refactor OAuthAuth using Authlib AsyncOAuth2Client
    - [x] 15-02-PLAN.md — Implement Device Authorization flow in backend and API
    - [ ] 15-03-PLAN.md — Implement DeviceFlowModal and update FlowHandler in frontend (human verification pending)
    - [x] 15-04-PLAN.md — Unify OAuth callback and support Client Credentials / Implicit flows
    - [x] 15-05-PLAN.md — E2E integration testing and UX polish with real providers

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

### Phase 14: v1.0 发布前细节加固 (Pre-release Hardening)
- 核心目标：在正式发布前修复可能引发后续迭代破坏性改动的风险，并补齐预置与体验细节。
- 四类核心工作：
  - 设计稳定性与兼容策略审计。
  - 四种 Integration Preset 配置与可用首启样例（Integration + Source + Dashboard）。
  - 文档与代码完整性核验。
  - UI 与交互细节补全。
  - 补充实现了通用的内置微组件。
- 执行波次：
  - Wave 1: 14-01, 14-02
  - Wave 2: 14-03, 14-04
  - Wave 3: 14-05

### Phase 15: OAuth 架构重构与多流支持 (Authlib 集成)
- 核心目标：引入专业库规范化 OAuth 实现，支持多种现代授权流并提供一致的 UI 交互。
- 实现授权码流 + PKCE (Authorization Code Flow with PKCE)。
- 实现设备代码流 (Device Authorization Grant - RFC 8628)，支持 Twitch 等公有客户端。
- 前端交互升级：
  - 设备授权面板 (Device Flow Modal)：验证地址引导、验证码展示、轮询状态反馈、倒计时。
  - 统一 OAuth 回调拦截器：兼容授权码流 (?code=) 与隐式流 (#access_token=)。
- 后端架构优化：
  - 集成 Authlib 核心库，处理多态响应（Start Authorization）。
  - 利用 Tauri 事件系统 (Event) 实现设备流异步通知。
- 执行波次：
  - Wave 1: 15-01
  - Wave 2: 15-02, 15-03
  - Wave 3: 15-04
  - Wave 4: 15-05
