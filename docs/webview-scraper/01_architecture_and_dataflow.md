# WebView Scraper 架构与数据流

## 1. 为什么需要 WebView Scraper

对 CSR 强依赖、Cookie/Session 复杂、或无公开 API 的平台，纯 HTTP 往往不可用。Glancier 在桌面端复用 Tauri WebView 能力，以低开销完成后台抓取。

## 2. 全链路数据流（Python -> React -> Rust -> JS）

1. Python 执行到 `webview` step，发现缺少可用抓取数据。
2. Python 标记 `NeedsInteraction(type="webview_scrape")` 并暂停。
3. React `FlowHandler` 接管，触发 Tauri IPC（`push_scraper_task`）。
4. Rust 创建隐藏 `scraper_worker`，注入拦截逻辑。
5. 页面执行时命中 `intercept_api`，JS 将响应数据回传 Rust。
6. Rust 发送 `scraper_result` 事件到 React。
7. React 调用后端交互接口提交抓取结果。
8. Python 恢复 Flow，后续 `extract` 继续处理数据。

## 3. 关键实现点

- 单例 worker：同一时刻仅保留一个 `scraper_worker`，避免状态污染。
- 资源拦截：拦截非必要静态资源，降低带宽与加载时间。
- 事件桥接：前端仅做事件中继，不在组件层承载抓取业务逻辑。

## 4. 与 Flow 的接口边界

- Flow 只关心 step 输入输出与恢复。
- Scraper 负责浏览器态执行与网络拦截。
- Flow step 定义见 [../flow/02_step_reference.md](../flow/02_step_reference.md)。
