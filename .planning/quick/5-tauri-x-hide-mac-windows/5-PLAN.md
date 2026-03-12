---
quick_task: 5
phase: quick-5
plan: 5
type: execute
wave: 1
depends_on: []
files_modified:
  - ui-react/src-tauri/src/lib.rs
  - ui-react/src-tauri/Cargo.toml
  - ui-react/src/components/TauriMenuBridge.tsx
  - ui-react/src/App.tsx
autonomous: true
---

<objective>
修复 Tauri 主窗口点击 X 后仅隐藏、但无法恢复的问题：支持 macOS 程序坞重开窗口，并增加 macOS/Windows 托盘菜单（显示窗口、集成管理、设置、退出）。
</objective>

<tasks>

<task>
  <name>Task 1: Rust 侧实现窗口恢复与托盘菜单</name>
  <files>ui-react/src-tauri/src/lib.rs, ui-react/src-tauri/Cargo.toml</files>
  <action>
添加 tray-icon feature，构建系统托盘图标与菜单项；关闭主窗口时改为 hide 并保留 quit 通道；支持左键托盘恢复窗口；支持 macOS Reopen 事件（程序坞点击）恢复主窗口。
  </action>
  <verify>
    <automated>cargo check --manifest-path ui-react/src-tauri/Cargo.toml</automated>
  </verify>
  <done>隐藏主窗口后有可用恢复入口，且退出菜单可正常退出应用</done>
</task>

<task>
  <name>Task 2: 前端接入菜单导航事件</name>
  <files>ui-react/src/components/TauriMenuBridge.tsx, ui-react/src/App.tsx</files>
  <action>
新增 Tauri 菜单桥接组件，监听 `app:navigate` 事件并跳转 `/integrations`、`/settings`、`/`，将组件挂载到 BrowserRouter 内。
  </action>
  <verify>
    <automated>npm run typecheck --prefix ui-react</automated>
  </verify>
  <done>托盘“集成管理/设置”可直接唤起主窗口并跳转对应页面</done>
</task>

<task>
  <name>Task 3: 记录 quick 产物与状态</name>
  <files>.planning/quick/5-tauri-x-hide-mac-windows/5-SUMMARY.md, .planning/STATE.md</files>
  <action>
记录实现说明、验证结果和关键文件，并将 quick 任务写入 STATE.md Quick Tasks Completed。
  </action>
  <verify>
    <manual>检查 STATE.md 与 quick 目录条目可追溯</manual>
  </verify>
  <done>本次 quick 任务可在后续会话中直接定位与追踪</done>
</task>

</tasks>

<success_criteria>
- 点击主窗口 X 后可通过程序坞点击（macOS）重新显示窗口
- 托盘图标存在并提供：显示窗口、集成管理、设置、退出
- 托盘菜单触发可唤起窗口并进行页面跳转
- cargo check 与前端 typecheck 通过
</success_criteria>
