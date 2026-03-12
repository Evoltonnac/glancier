---
created: 2026-03-10T12:00:00.000Z
title: global-state-chat-sidebar
area: architecture, ui
---

## Problem
在目前的前端路由架构下，如果想进行全局的状态保存（如页面的数据缓存和revalidate）以及维持全局右侧 Agent Chat 对话框状态，需要对 React Router + Zustand 的架构进行微调。由于切换路由会引发组件卸载，无法保持 Chat 的输入和连接状态，同时也缺乏静默后台数据更新机制。

## Proposed Solution
1. **全局右侧 Agent Chat 对话框状态维持**
   - **组件层级提升**：将 `AgentChatSidebar` 移至 `ui-react/src/App.tsx` 中的 `<Routes>` 之外，与路由主内容区并列，使其不受路由切换的影响。
   - **状态全局化**：在 `store/index.ts` 中管理 Chat 的打开/关闭和聊天记录状态，以便从任何页面调起。
2. **页面的数据缓存和 Revalidate**
   - **方案A（推荐）**：引入 `TanStack Query` (React Query) 或 `SWR` 接管服务端状态，自动处理缓存和 `stale-while-revalidate` 机制。
   - **方案B（轻量级）**：基于当前 Zustand，在 `loadData` 方法中增加时间戳（`lastFetchedAt`）和后台静默更新标志（`isRevalidating`），以避免每次进入页面都触发全屏 Loading。
