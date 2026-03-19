---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Security Audit Remediation
status: executing
last_updated: "2026-03-19T14:17:15.886Z"
last_activity: 2026-03-19 — Completed 03-05 optional script sandbox and timeout controls with full regression/typecheck gates passing
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference
See: .planning/PROJECT.md (Updated for v1.1)

**Core value:** In a config-first workflow, users can still finish auth -> fetch -> parse -> render without backend hardcoding.
**Current focus:** Phase 3 completion recorded; milestone is ready for closeout verification and archival workflow.

## Current Position
Phase: 3
Plan: 05 completed (`03-05-PLAN.md`)
Status: Phase 3 complete; 03-01 through 03-05 completed
Last activity: 2026-03-19 — Completed 03-05 optional script sandbox and timeout controls with passing targeted regressions, impacted, backend, frontend, and typecheck gates

## Session Continuity
- v1.0 has shipped and Phase 1/2 follow-up work is completed and retained in historical context.
- This milestone starts from Phase 3, scoped to critical security-audit remediation in core modules.
- 2026-03-19T11:57:10Z: Session resumed via `$gsd-resume-work`; reviewed Script Step sandbox tradeoffs and mapped compatibility impact before proceeding to Plan 03-03.
- 2026-03-19T12:18:25Z: Added `03-05-PLAN.md` to phase roadmap for opt-in lightweight sandbox (Beta) plus default script timeout controls.
- 2026-03-19T12:54:33Z: Completed Plan 03-04 with atomic task commits, release-gate checklist finalization, and passing auth/fetch/refresh regression gates.
- 2026-03-19T14:15:55Z: Completed Plan 03-05 with atomic task commits, script timeout+sandbox controls, and passing regression/typecheck/backend/frontend gates.

## Accumulated Context

### Roadmap Evolution
- 2026-03-15: Phase 1 added - Backend-driven webview scraper reliability for minimized, hidden, and occluded window states.
- 2026-03-15: Phase 1 completed - all 3 plans executed and manual UAT matrix passed.
- 2026-03-16: Phase 2 added - 易用性优化（统一界面文案与错误格式化、支持中英 i18n、刷新间隔和默认加密体验优化）。
- 2026-03-17: Phase 3 added - Remediate critical security audit findings in core modules.
- 2026-03-19: Started milestone v1.1 and consolidated completed Phase 1/2 history into v1.0 context.
- 2026-03-19: Completed Plan 03-01 with atomic task commits and summary documentation.
- 2026-03-19: Completed Plan 03-02 with deterministic HTTP URL policy guards and script-step hardening; removed unused parser module from runtime codebase.
- 2026-03-19: Added Plan 03-05 for optional script-sandbox controls and timeout defaults.
- 2026-03-19: Completed Plan 03-03 with centralized log redaction, authenticated internal scraper endpoints, and logical integration file response hardening.
- 2026-03-19: Completed Plan 03-04 with OAuth callback hardening, documented security release gate evidence, and passing regression gates.
- 2026-03-19: Completed Plan 03-05 with backend-owned script sandbox/timeout settings, Beta advanced UI controls, deterministic runtime error codes, and concurrent regression coverage.

### Decisions
- 2026-03-19: OAuth code exchange now requires single-use server state bound to `source_id` and `redirect_uri`.
- 2026-03-19: `/api/sources/{source_id}/interact` now enforces route-bound source ownership and payload key allowlists.
- 2026-03-19: HTTP step rejects private/link-local/loopback and unsupported scheme targets preflight with `http_target_blocked_private` / `http_target_blocked_scheme`.
- 2026-03-19: Script step remains inline `args.code` only; undocumented file-path loading behavior removed.
- 2026-03-19: Removed `core/parser.py` and parser-specific tests because parser step is not in the runtime execution chain.
- [Phase 03]: Internal scraper APIs now require X-Glanceus-Internal-Token via constant-time validation and still enforce localhost as a secondary gate.
- [Phase 03]: Integration file API responses now serialize logical identifiers (filename/integration_id) and no longer expose absolute paths.
- [Phase 03]: Sensitive token/secret/code/device fields are centrally redacted with deterministic [REDACTED] across API, OAuth, and script-step logging.
- [Phase 03]: OAuth callback UI now rejects malformed code-exchange payloads before API submission and depends on backend-returned source_id for completion.
- [Phase 03]: Phase 03 security gate now records deterministic PASS/FAIL command evidence mapped to GATE-01/GATE-02 requirements.
- [Phase 03]: TypeScript callback path changes require make test-typecheck as a mandatory release-gate command for this plan.
- [Phase 03-remediate-critical-security-audit-findings-in-core-modules]: Keep script sandbox disabled by default and mark UI control as Beta to preserve existing integration behavior.
- [Phase 03-remediate-critical-security-audit-findings-in-core-modules]: Bind script runtime controls to /api/settings so backend remains owner of persisted security preferences.
- [Phase 03-remediate-critical-security-audit-findings-in-core-modules]: Use deterministic runtime error codes script_timeout_exceeded/script_sandbox_blocked for stable regression handling.

### Pending Todos

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | 移动刷新按钮到侧边栏 | 2026-03-13 | 001d3db | [001-move-refresh-buttons](./milestones/v1.0-quick/001-move-refresh-buttons/) |
| 002 | widgets data_source 支持 inline array | 2026-03-13 | 92195f5 | [002-widgets-datasource](./milestones/v1.0-quick/2-widgets-datasource/) |
| 003 | 将布局密度的 CSS 变量从 PX 转换为 REM，检查 widgets 组件，统一使用 REM 进行间距布局 | 2026-03-13 | 2ff61cc | [3-css-px-rem-widgets-rem](./milestones/v1.0-quick/3-css-px-rem-widgets-rem/) |
| 004 | integration 重载按钮页面级生效，保存/重载结果 toast 提示并区分视图改动与逻辑改动，逻辑改动自动刷新受影响 source | 2026-03-14 | dd6b011 | [4-integration-toast-source-source-source](./milestones/v1.0-quick/4-integration-toast-source-source-source/) |
| 005 | bento 布局微组件参数模板解析架构升级：全局参数解析 + size/spacing 等非 value 参数模板化 + 性能缓存优化 | 2026-03-14 | 0309b86 | [5-bento-value-size-spacing](./milestones/v1.0-quick/5-bento-value-size-spacing/) |
| 006 | SDUI schema 去重重构：$defs 单一真源、Widget 分类分流、保留 widget_tree 与 widget_defs 兼容视图 | 2026-03-14 | bf8d327 | [6-sdui-schema-widget-widget-tree-widget-de](./milestones/v1.0-quick/6-sdui-schema-widget-widget-tree-widget-de/) |
| 008 | Translate Chinese-written docs/comments to English and optimize redundant content | 2026-03-14 | pending | [8-translate-all-chinese-written-docs-and-c](./milestones/v1.0-quick/8-translate-all-chinese-written-docs-and-c/) |
| 009 | Commit opener fix and sync CI/build docs for recent release pipeline changes | 2026-03-16 | pending | [9-ci-build](./milestones/v1.0-quick/9-ci-build/) |
| 012 | 重新处理设置页的关于页面 UI 展示，将图标替换为 Header SVG 并添加相同背景色，美化介绍 | 2026-03-16 | c9cd0a0 | [12-ui-header-svg](./milestones/v1.0-quick/12-ui-header-svg/) |
| 010 | Clarify API key step vs generic form step boundaries | 2026-03-16 | pending | [10-api-key-api-key-data-output-api-key-secr](./milestones/v1.0-quick/10-api-key-api-key-data-output-api-key-secr/) |
| 011 | 将 skills 下的 prompt 打包进项目文件（客户端），并在集成创建弹窗加入 AI 星星按钮与新弹窗（复制 prompt/跳转 GitHub skills） | 2026-03-16 | c0e201f | [11-skills-prompt-ai-prompt-github-skills](./milestones/v1.0-quick/11-skills-prompt-ai-prompt-github-skills/) |
| 260317-0uf | 开启tauri更新检测，包括创建密钥 | 2026-03-16 | 5e4f61e | [260317-0uf-tauri](./milestones/v1.0-quick/260317-0uf-tauri/) |
| 260317-uyq | 处理网络超时错误码：后端新增专用异常并补齐前端i18n映射 | 2026-03-17 | 9769aa1 | [260317-uyq-i18n](./milestones/v1.0-quick/260317-uyq-i18n/) |
| 260318-eax | Breaking change: remove master_key from settings API/storage, use keyring-only MasterKeyProvider with backend+frontend+tests updates | 2026-03-18 | c283103 | [260318-eax-breaking-change-remove-master-key-from-s](./milestones/v1.0-quick/260318-eax-breaking-change-remove-master-key-from-s/) |
| 260318-u6b | 优化两个交互问题：Dashboard 轮询启动即请求；集成 default_refresh_interval_minutes 支持 120 分钟 | 2026-03-18 | f1090fe | [260318-u6b-dashboard-sources-default-refresh-interv](./quick/260318-u6b-dashboard-sources-default-refresh-interv/) |

## Pending Todos
- [ ] [2026-03-10] global-state-chat-sidebar (Area: architecture, ui)
- [ ] [2026-03-08] topnav-global-search (Area: ui)
- [ ] [2026-03-06] dashboard-sidebar-hover-add-widget (Area: ui)
- [ ] [2026-03-06] dashboard-multi-view-tabs (Area: ui)
- [ ] [2026-03-06] flowhandler-refactor (Area: ui)
- [ ] [2026-03-07] ui-i18n (Area: ui)
- [ ] [2026-03-07] ux-ai-enhancements (Area: ui, core)
- [ ] [2026-03-07] bento-card-custom-colors (Area: ui)
- [ ] [2026-03-07] security-static-analysis (Area: security)
- [ ] [2026-03-07] frontend-duplicate-requests-bug (Area: ui)
- [ ] [2026-03-07] click-to-copy-interaction (Area: ui)
- [ ] [2026-03-13] density-toggle-optimization (Area: general)
