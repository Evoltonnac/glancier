---
quick_task: 5
phase: quick-5
plan: 5
subsystem: tauri-shell
tags: [tauri, tray, window-lifecycle, macos, windows]
completed_date: "2026-03-08T04:42:58Z"
key_files:
  created:
    - ui-react/src/components/TauriMenuBridge.tsx
    - .planning/quick/5-tauri-x-hide-mac-windows/5-PLAN.md
  modified:
    - ui-react/src-tauri/src/lib.rs
    - ui-react/src-tauri/Cargo.toml
    - ui-react/src/App.tsx
verification:
  - cargo check --manifest-path ui-react/src-tauri/Cargo.toml
  - npm run typecheck --prefix ui-react
---

# Quick Task 5: Tauri 隐藏后无法恢复窗口

## One-liner
修复主窗口点击 X 后隐藏但无法恢复的问题，新增程序坞重开处理与跨平台托盘菜单入口，确保窗口可重新显示并支持快速导航。

## What Changed

1. `ui-react/src-tauri/src/lib.rs`
- 新增 `show_main_window` 统一窗口恢复逻辑：处理 `unminimize/show/focus`。
- 新增 `AppLifecycleState`：区分“隐藏窗口”和“真正退出”，防止退出动作被 close 拦截。
- `on_window_event` 仅对 `main` 窗口执行 `CloseRequested -> hide`。
- 新增托盘图标与菜单：`显示窗口`、`集成管理`、`设置`、`退出`。
- 托盘左键/双击恢复主窗口。
- macOS 下响应 `RunEvent::Reopen`（程序坞点击）恢复主窗口。
- 菜单“集成管理/设置”通过 `app:navigate` 事件通知前端跳转。

2. `ui-react/src-tauri/Cargo.toml`
- 为 `tauri` 启用 `tray-icon` feature，支持托盘模块。

3. 前端导航桥接
- 新增 `ui-react/src/components/TauriMenuBridge.tsx`：监听 `app:navigate`，白名单路由跳转。
- 在 `ui-react/src/App.tsx` 挂载 `TauriMenuBridge`。

## Verification
- `cargo check --manifest-path ui-react/src-tauri/Cargo.toml` 通过
- `npm run typecheck --prefix ui-react` 通过

## Notes
- `cargo check` 中存在若干历史告警（`scraper.rs` 的宏 cfg / 命名风格 / 可见性），本次未扩大范围处理。
