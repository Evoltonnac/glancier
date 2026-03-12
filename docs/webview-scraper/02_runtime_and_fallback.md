# WebView Scraper 运行时约束与降级策略

## 1. Tauri 与 Web 环境差异

WebView Scraper 依赖 Tauri 原生窗口与 IPC：
- Tauri 环境：支持任务队列、日志、超时控制。
- 纯 Web 环境：不支持抓取执行，必须提供降级提示与下载客户端引导。

## 2. 运行时行为约束

- 非 Tauri 环境下，Scraper 相关动作必须 no-op，不可尝试调用 Tauri API。
- 每个抓取任务应配置 timeout（默认值由设置项提供）。
- 超时任务应自动出队，调度器继续后续任务。
- 抓取日志应可在 UI 可视化展示，便于排障。

## 3. 交互降级策略

当 Flow 进入 `webview_scrape` 但运行在浏览器：
1. 对话框明确提示“Web 端不可执行网页抓取”。
2. 提供桌面客户端下载入口。
3. 隐藏/替换手动启动按钮，避免用户无效操作。

## 4. 状态可观测性

建议同时展示：
- 当前任务状态（idle/running/timeout/failed）
- 队列长度
- 最近错误摘要

Flow 侧失败样例见 [../flow/04_step_failure_test_inputs.md](../flow/04_step_failure_test_inputs.md)。
