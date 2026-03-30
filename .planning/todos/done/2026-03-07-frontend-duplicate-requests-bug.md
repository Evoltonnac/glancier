---
created: 2026-03-07T14:45:00Z
title: frontend-duplicate-requests-bug
area: ui
files:
  - ui-react/src/hooks/
  - ui-react/src/api/
---

## Problem

前端在组件渲染或Hook触发时存在同时多次重复请求的Bug。初步怀疑与React的严格模式(Strict Mode)下的双重调用或Hook依赖项处理不当导致的多次渲染有关。

## Solution

1. 定位Bug原因：检查相关Hook（如useEffect, custom hooks）的触发逻辑。
2. 修复请求风暴：引入请求去重机制（如AbortController, debounce或SWR/React Query自带的去重功能）。
3. 补充规范：在项目文档中补充React Hook使用规范和请求处理最佳实践，避免类似问题再次发生。
