# Quick Task: 减弱主题对比度并统一 Tauri 导航栏颜色

**Goal:** 
整体减弱配色对比度，适配 Tauri 导航栏沉浸式体验，并使编辑器自动适应应用浅色/深色主题。

## Tasks

- [x] **Update `ui-react/src/index.css`:**
  - 修改 `light` 和 `dark` 的 `--background`, `--foreground`, `--surface`, `--card` 颜色以降低对比度。
- [x] **Configure Tauri Window (`ui-react/src-tauri/tauri.conf.json`):**
  - 添加 `"titleBarStyle": "Overlay"` 与 `"hiddenTitle": true` 实现沉浸式 macOS 标题栏。
- [x] **Update `TopNav.tsx`:**
  - 添加 `data-tauri-drag-region` 属性使得顶部导航栏成为拖拽区域。
- [x] **Update `Integrations.tsx`:**
  - 引入 `useTheme` 并通过 `MutationObserver` 监听深色模式，使编辑器组件在 `light` 与 `vs-dark` 主题间自适应。

## Execution & Verification
All changes have been successfully written and verified locally.

**State Updates:**
- [x] Added to STATE.md Quick Tasks table.
- [x] Committed to Git.
