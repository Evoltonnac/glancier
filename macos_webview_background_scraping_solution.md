# macOS 平台 Webview 后台抓取全屏挂起问题解决技术方案

## 1. 背景与问题描述

在项目使用 Tauri 内置 Webview (WebKit on macOS) 进行后台数据抓取时，观察到以下现象：
当主应用在 macOS 上进入全屏模式时，部分网站的数据抓取会一直处于超时状态；而当应用恢复为窗口模式时，抓取能够迅速成功。其他部分网站则不受此影响。
通过代理网络请求分析，确认出现问题的网站已经发出了网络请求并获取了初始 HTML，但后续的数据提取流程卡死。

## 2. 根因分析

该问题由 macOS 底层的窗口管理机制（WindowServer）、WebKit 的后台节流策略（Throttling）以及目标网站的具体技术栈共同导致。

### 2.1 macOS 的 Space (空间) 机制与 WebKit 挂起
为了实现“后台静默抓取”，目前的实现是在屏幕坐标 `(0, 0)` 创建一个尺寸为 `1x1` 像素的不可见微型 Webview 窗口。
*   **窗口模式下：** `1x1` 窗口与主应用窗口同处于一个桌面空间 (Space)，系统判定其存在于活跃视窗树中，因此分配渲染和 JS 执行资源。
*   **全屏模式下：** 主应用独占一个全新的全屏 Space。原来的桌面空间被切入后台。此时，驻留在原桌面的 `1x1` 窗口被 macOS 判定为“完全不可见且处于非活跃空间”。
*   **资源节流 (Throttling)：** 为节省电量，macOS 会对非活跃空间的 WebKit 实例采取极具侵略性的节流措施。虽然网络请求 (基于系统底层进程) 仍能发出，但 JavaScript 引擎中的特定 API（尤其是渲染强相关的 API）会被大幅降级或完全挂起。

### 2.2 目标网站架构差异导致的不同表现
*   **不受影响的网站：** 通常是服务端渲染 (SSR) 或静态页面。核心数据在 HTML 下载完毕时已存在于 DOM 中。抓取脚本无需等待复杂的客户端 JS 执行即可提取数据，因此不受 WebKit 挂起影响。
*   **受影响（超时）的网站：** 通常是重度依赖 JavaScript 的单页应用 (SPA，如 React/Vue)、包含复杂动画或带有特定前端防御机制的网站。它们的抓取失败原因包括：
    1.  **`requestAnimationFrame` 罢工：** 处于非活跃全屏空间的 Webview，其 `requestAnimationFrame` 会被彻底暂停执行。如果目标网站的数据渲染逻辑依赖于此（如某些 UI 组件库），页面将永远无法完成最终渲染，导致抓取脚本持续等待目标 DOM 元素直至超时。
    2.  **Page Visibility API 检测：** 后台 Webview 的 `document.visibilityState` 会被置为 `hidden`。部分网站出于性能优化或反爬风控目的，检测到页面不可见时，会主动暂停初始化、终止数据轮询或拒绝加载核心内容。
    3.  **视口尺寸与懒加载冲突：** `1x1` 像素的极小视口无法触发基于 `IntersectionObserver` 的图片或数据懒加载。目标组件由于“未进入可视区域”而永远不发起真实的数据拉取请求。部分响应式布局网站也会在极小视口下挂起核心加载流程。

## 3. 破局方案设计

为了在不改变现有 Tauri 架构的前提下解决此问题，需要从“欺骗操作系统”和“欺骗网页 JS 环境”两个维度进行干预。按照实施成本从低到高，提供以下四种方案。推荐优先尝试方案一与方案二的组合。

### 方案一：跨空间可见性保活 (最低成本，最推荐)

**核心思路：** 强制 `1x1` 爬虫窗口跟随主应用在所有桌面空间（Spaces）保持可见，避免因主程序全屏切换空间而被 macOS 遗弃在后台从而触发深度挂起。

**实施步骤：**
在 `ui-react/src-tauri/src/scraper.rs` 中，配置 Webview Builder 时，添加特定于 macOS 的跨空间属性。

```rust
// 修改 ui-react/src-tauri/src/scraper.rs 中 background mode 的 builder 配置
builder = builder
    .visible(true)
    .decorations(false)
    .inner_size(1.0, 1.0)
    .position(0.0, 0.0)
    .skip_taskbar(true)
    // 【关键新增】强制窗口在所有桌面空间都存在
    .visible_on_all_workspaces(true); 
```

**预期效果：** 无论主应用是否全屏，爬虫窗口始终与活跃窗口处于同一 Space，系统将持续为其分配重绘和 JS 执行资源，缓解 `requestAnimationFrame` 死锁。

### 方案二：JavaScript 环境状态伪装 (防守反击)

**核心思路：** 通过在 Webview 加载前注入 JavaScript，篡改关键的浏览器 API，强制让目标网站代码认为当前页面“完全可见”且运行在正常环境中。

**实施步骤：**
在 Webview 初始化脚本 (`initialization_script`) 中注入以下 Hook 代码。

```javascript
// 1. 强制伪造可见性状态
Object.defineProperty(document, 'visibilityState', {
    get: function() { return 'visible'; }
});
Object.defineProperty(document, 'hidden', {
    get: function() { return false; }
});

// 2. 劫持并伪装 IntersectionObserver (强制所有元素瞬间可见)
const NativeIntersectionObserver = window.IntersectionObserver;
window.IntersectionObserver = class extends NativeIntersectionObserver {
    constructor(callback, options) {
        super((entries, observer) => {
            const fakeEntries = entries.map(entry => ({
                ...entry,
                isIntersecting: true,
                intersectionRatio: 1
            }));
            callback(fakeEntries, observer);
        }, options);
    }
};

// 3. 降级接管 requestAnimationFrame (防止彻底死锁)
window.requestAnimationFrame = function(callback) {
    return setTimeout(() => callback(performance.now()), 16); // 16ms, 约 60fps
};
```

**预期效果：** 瓦解目标网站内部的懒加载和可见性检测防御机制，确保即使在后台或小视口下，网页仍能走完核心渲染流程。

### 方案三：正常尺寸的透明视口 (解决 1x1 视口限制)

**核心思路：** 放弃易被识别且易触发懒加载失败的 `1x1` 微型窗口。创建一个接近正常用户分辨率的大尺寸窗口，通过透明度将其在视觉上隐藏。

**实施步骤：**

```rust
builder = builder
    .visible(true)
    .decorations(false)
    .inner_size(1024.0, 768.0) // 提供真实浏览器的视口尺寸
    .position(0.0, 0.0)
    .skip_taskbar(true)
    .transparent(true) // 【关键新增】视觉透明
    .visible_on_all_workspaces(true);
```

**优缺点：** 能完美解决响应式布局卡死和严格反爬策略（如视口尺寸校验）。但由于渲染面积增大，对系统资源的消耗会有所上升。

### 方案四：架构级替换 (备用终极方案)

**核心思路：** 如果 macOS 的系统级优化过于激进，导致上述基于 UI 进程的 Webview 方案仍不稳定，则彻底剥离 UI 依赖。

**实施步骤：**
放弃使用 Tauri 的内置 Webview 进行后台抓取。引入独立的 Headless 浏览器进程（如集成基于 Node.js/Python 的 Puppeteer/Playwright sidecar）。

**优缺点：** 独立进程具备纯正的无头模式 (`--headless`)，完全免疫操作系统的视窗节流策略，稳定性最高。但引入了极高的架构复杂度和跨语言通信成本，作为最后的兜底手段。

## 4. 实施建议与行动计划

1.  **优先级 1 (立即执行)：** 在 `ui-react/src-tauri/src/scraper.rs` 中实施 **方案一** (`visible_on_all_workspaces(true)`)。这仅需修改一行 Rust 代码，预期能解决绝大部分因全屏引起的空间切换挂起问题。
2.  **验证测试：** 重新编译后，复现之前的全屏抓取流程。观察超时网站是否恢复正常。
3.  **优先级 2 (根据测试结果推进)：** 若方案一实施后仍有部分网站存在超时（通常是由于内部逻辑限制），则组合实施 **方案二** (JS 环境伪装) 注入 Hook 脚本。
4.  **持续监控：** 若在极小概率下仍遇到因视口尺寸导致的风控拦截，再考虑升级至 **方案三** (透明大窗口)。
