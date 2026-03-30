---
created: 2026-03-06T15:00:00Z
title: flowhandler-refactor
area: ui
files:
  - ui-react/src/components/auth/FlowHandler.tsx
---

## Problem

`FlowHandler` 需要重构，当前排版可能不够优化，且对各种不同类型操作的展示内容和交互操作缺乏详尽和严格的定义。

## Solution

1. 梳理并在 `FlowHandler` 内部详尽严格地定义各类型操作（如 input, select, message 等）所需的展示内容与交互行为。
2. 优化各类子项组件和 `FlowHandler` 整体的排版布局。
3. 确保视觉风格统一，并提升各类型交互的体验反馈。
