---
status: awaiting_human_verify
trigger: "tauri-client-external-links-not-opening: 客户端状态下外链（Link/a/OAuth/Monaco cmd+click）无法打开"
created: 2026-03-11T06:36:00Z
updated: 2026-03-11T06:43:00Z
---

## Current Focus

hypothesis: 仅依赖前端 `plugin-shell open` 路径不稳定（即使检测修正后用户仍复现失败）；改为 Rust 原生命令直接调用系统 `open` 可绕过该路径问题
test: 新增 Tauri 命令 `open_external_url`，前端 `openExternalLink` 优先调用该命令，失败再退回 `plugin-shell` 与 `window.open`
expecting: 在客户端状态下，Link 组件、`<a>`、OAuth 按钮、Monaco cmd+click 外链都能统一打开系统浏览器
next_action: 用户在客户端实机验证 4 类入口

## Symptoms

expected: 在 Tauri 客户端中点击外链时，系统默认浏览器被打开
actual: Link 组件、`<a>` 标签、OAuth 按钮、Monaco cmd+click link 都无法打开外部网页
errors: 未提供明确错误堆栈
reproduction: 在客户端点击任一外链入口即可复现
started: 2026-03-11（用户报告）
platform: macOS / Tauri v2（推断）

## Eliminated

- hypothesis: `shell:allow-open` capability 缺失
  evidence: `ui-react/src-tauri/capabilities/default.json` 已包含 `shell:allow-open`
  timestamp: 2026-03-11T06:31:00Z

## Evidence

- timestamp: 2026-03-11T06:33:00Z
  checked: `ui-react/src/main.tsx`
  found: 外链拦截与 `window.open` override 仅在 `__TAURI_INTERNALS__`/`__TAURI__` 命中时安装
  implication: 若客户端 runtime 未暴露这两个全局，拦截逻辑完全失效

- timestamp: 2026-03-11T06:34:00Z
  checked: `ui-react/src/lib/utils.ts`
  found: `isTauri()` 仅检查 `__TAURI_INTERNALS__`/`__TAURI__`
  implication: `openExternalLink` 可能误判为非 Tauri，直接走 `window.open`

- timestamp: 2026-03-11T06:35:00Z
  checked: `ui-react/node_modules/@tauri-apps/api/core.js`
  found: 官方 `isTauri()` 判断是 `!!globalThis.isTauri`
  implication: 本项目自定义判断与官方运行时信号不一致，可能在客户端模式下误判

- timestamp: 2026-03-11T06:39:00Z
  checked: 用户回归反馈
  found: 第一轮“仅修正 runtime 检测”后问题仍复现（四类入口均未恢复）
  implication: 根因不止环境检测；需要替换链接打开主路径，而不只是调整检测条件

- timestamp: 2026-03-11T06:41:00Z
  checked: `ui-react/src-tauri/src/lib.rs`
  found: 项目已有跨平台系统打开能力（`open_path_in_file_manager` 使用系统命令），可扩展为 URL 打开命令
  implication: 通过 Tauri 自定义命令直接调用系统 opener，可绕过 plugin-shell 依赖链

## Resolution

root_cause: 外链打开主路径过度依赖前端 `plugin-shell open` + runtime 检测，在用户客户端状态下该路径未成功执行；单纯扩大检测条件不足以恢复功能。
fix: 新增 Tauri 命令 `open_external_url`（Rust 直接调用系统 opener）；前端 `openExternalLink` 优先调用该命令，失败再回退 `plugin-shell` / `window.open`；同时增强 `isTauri()`（`globalThis.isTauri` + userAgent + protocol + 旧全局）并让 `main.tsx` 的全局拦截复用该链路。
verification: 待用户在客户端实机验证 Link/a/OAuth/Monaco 四种入口。
files_changed: ["/Users/xingminghua/Coding/tools/quota-board/ui-react/src-tauri/src/lib.rs", "/Users/xingminghua/Coding/tools/quota-board/ui-react/src/lib/utils.ts", "/Users/xingminghua/Coding/tools/quota-board/ui-react/src/main.tsx"]
