---
status: awaiting_human_verify
trigger: "刷新数据源时，没有任何控制台日志 - scraper 相关逻辑根本没有被触发"
created: 2026-03-12
updated: 2026-03-12
---

## Current Focus

已修复：polling 完成后调用 bumpQueueNonce() 触发抓取检查

## Root Cause

当用户刷新数据源时：
1. 状态立即变为 "refreshing"
2. Polling effect 检测到 refreshing 状态，开始轮询
3. 刷新完成后，后端更新状态为 "suspended"
4. Polling effect 调用 setSources() 更新数据 - **但没有调用 bumpQueueNonce()**
5. 第三个 effect（Monitor for background scraper tasks）依赖 queueNonce 变化来触发
6. 由于 queueNonce 没变，第三个 effect 不会运行
7. 结果：抓取任务不会被自动启动

## Fix Applied

**File:** ui-react/src/hooks/useScraper.ts

**Changes:**
1. 在 polling effect 中，当刷新完成时调用 `bumpQueueNonce()` (第 427 行)
2. 将 `bumpQueueNonce` 添加到 effect 依赖项中 (第 437 行)

## Evidence

- timestamp: 2026-03-12
  checked: useScraper.ts 第 419-430 行
  found: 原来 polling 完成后只调用 setSources()，没有触发 queueNonce 变化
  implication: 第三个 effect 不会重新运行，抓取任务不会自动启动

- timestamp: 2026-03-12
  checked: useScraper.ts 第 465-479 行 (background scraper monitor)
  found: 依赖项包含 queueNonce，需要变化才能触发
  implication: polling 完成后必须 bumpQueueNonce 才能触发抓取

## Verification

**Self-verified checks:**
- TypeScript 编译通过

**How to check:**
1. 刷新一个有 webview_scrape 交互的数据源
2. 等待刷新完成（状态从 refreshing 变回 suspended）
3. 观察控制台日志，应该看到:
   - `[startScraperTask] Starting scraper for...`
   - `[startScraperTask] push_scraper_task succeeded for...`
4. 验证抓取任务被推送并执行

**Tell me:** "confirmed fixed" OR what's still failing (include any console output)
