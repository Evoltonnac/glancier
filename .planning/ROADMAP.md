# Roadmap: Glanceus

## Overview
This roadmap manages the delivery path for Glanceus. Completed milestones are archived for historical reference.

## Milestones

- [x] **v0.1: MVP Foundation & UI Refactoring** — [[Archived Roadmap](.planning/milestones/v0.1-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v0.1-REQUIREMENTS.md)]
- [x] **v1.0: 跃迁 —— Glanceus 正式版发布计划** — [[Archived Roadmap](.planning/milestones/v1.0-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v1.0-REQUIREMENTS.md)] [[Audit](.planning/milestones/v1.0-MILESTONE-AUDIT.md)]

## Active Milestones

<details>
<summary>✅ v1.0 (Phases 09-15) — SHIPPED 2026-03-13</summary>

- [x] Phase 09: 品牌与精神重塑 (4/4 plans) — 2026-03-05
- [x] Phase 10: 代码语义更新与组件重构 (5/5 plans) — 2026-03-06
- [x] Phase 11: 测试覆盖与 TDD 规范确立 (6/6 plans) — 2026-03-06
- [x] Phase 12: 错误暴露与展示增强 (3/3 plans) — 2026-03-08
- [x] Phase 13: Release v1.0 稳定版发版 (4/4 plans) — 2026-03-09
- [x] Phase 14: v1.0 发布前细节加固 (5/5 plans) — 2026-03-12
- [x] Phase 15: OAuth 架构重构与多流支持 (5/5 plans) — 2026-03-12

**Key Deliverables:**
- Glanceus branding and semantic codebase update
- Full TDD test coverage for backend/frontend
- Error surfacing and visibility enhancements
- Tauri release build with CI/CD
- OAuth Authlib integration with multi-flow support

</details>

## Next Milestone

*Coming soon — run `/gsd:new-milestone` to start planning*

### Phase 1: Backend-driven webview scraper reliability for minimized hidden and occluded window states (Completed: 2026-03-15)

**Goal:** Make WebView scraping complete reliably when the client is minimized, hidden, or visually occluded/invisible to the user, without requiring Dashboard polling to be active.
**Requirements**: Backend-owned task orchestration, Rust daemon claim/complete path, frontend observer/manual fallback.
**Depends on:** None
**Plans:** 3/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Backend durable scraper task pipeline
- [x] 01-02-PLAN.md — Rust daemon claim loop and direct callback
- [x] 01-03-PLAN.md — Frontend role refactor, reliability validation, and docs

### Phase 2: 易用性优化。 (Completed: 2026-03-16)

产品即将正式发布，在那之前，先统一所有界面文案及输出的错误信息。

- 界面文案要贴近产品语言，不要用特别技术性、系统化的词语，也不要用冗长的句子。
- 错误信息在输出时采用标准格式化方法，为后续 i18n 做准备。

然后，进行全盘 i18n 国际化，先只处理中文和英文两种语言，默认语言使用英文。 语言切换放在设置页面中。
最后
- 自动刷新时间默认设置为30分钟，选择范围扩大一点，最大为一天，最小为5分钟，选项保持4到5个，例如5分钟、30分钟、1小时、一天等。
- 高级设置中的加密默认开启，启动时为用户生成一次密钥。

**Goal:** Deliver a release-ready usability layer with user-friendly copy, standardized runtime errors, bilingual (EN/ZH) UI, and safer default system settings for refresh/encryption.
**Requirements**: [P2-REQ-01, P2-REQ-02, P2-REQ-03, P2-REQ-04]

- **P2-REQ-01**: Core UI copy uses concise, product-facing language (avoid technical/system-heavy phrasing).
- **P2-REQ-02**: Runtime error output follows a consistent formatted structure suitable for localization.
- **P2-REQ-03**: Full i18n support for English and Chinese, default language is English, language switch is available in Settings.
- **P2-REQ-04**: Global refresh default is 30 minutes with options from 5 minutes to 1 day; encryption is enabled by default and generates a master key once at startup.
**Depends on:** Phase 1
**Plans:** 3/3 plans executed

Plans:
- [x] 02-01-PLAN.md — Standardize runtime error envelope for localization-ready UX
- [x] 02-02-PLAN.md — Build EN/ZH i18n foundation and migrate core UI copy
- [x] 02-03-PLAN.md — Finalize refresh/encryption defaults and settings UX hardening
