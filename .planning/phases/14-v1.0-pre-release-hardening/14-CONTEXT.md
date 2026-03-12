# 14-CONTEXT: v1.0 Pre-release Hardening

## Overview
Phase 14 的核心是在 v1.0 正式发布前消除潜在的破坏性改动风险，固化初始可用体验，并补齐文档与界面反馈细节。
本文件记录了指导实施的关键架构和产品体验决策。

## 决策记录 (Implementation Decisions)

### 1. 初始配置包 (Starter Bundle) 与预设场景
*   **开箱首屏展示 (5 种微组件)**：
    *   普通 Fetch (科技/开源)：DEV.to 科技新闻图文卡片。
    *   API Key (开发者/工具)：OpenRouter 查询 API 剩余额度与账单余额。
    *   OAuth (娱乐/媒体)：Twitch 获取并展示当前正在直播的关注主播列表。
    *   Webview Scraper (生活/隐私)：iCloud 存储空间容量监控。
    *   免鉴权 API (金融/市场)：实时金价 (Gold Price) 行情展示。
*   **创建新集成的 Preset 模板 (4 大核心接入方式)**：
    *   API Key 模板：OpenRouter 额度查询。
    *   OAuth 模板：Twitch 在线主播列表。
    *   Webview Scraper 模板：iCloud 存储空间监控。
    *   cURL 模板：作为语法教学示例，使用虚构接口并配备详细英文注释（指导自定义 Headers 和数据过滤）。
*   *(注：针对不同数据源的新组件类型需求，已记录作为 Deferred Idea 在后续阶段讨论。)*

### 2. 兼容与演进策略 (Compatibility Strategy)
*   **YAML 配置升级**：后端加载时检测 `version`，在内存中执行自动热升级到新结构。
*   **旧语法弃用期**：提供宽限期，使用警告日志或界面提示告知用户，但不立即阻断执行。
*   **Dashboard 微件兼容**：如果微件配置参数 (如组件类型) 发生破坏性改动，采用静默降级处理 (尽力适配，失败则使用默认值并保留原配置)。
*   **风险审计范围**：包含用户侧配置文件 (YAML/JSON) 与系统内部代码 (Python/React API组件) 的兼容性风险。

### 3. UI 反馈与交互标准 (UI Feedback Standards)
*   **提示类型区分**：保存成功等弱提示使用 Toast；表单报错等需要长时间展示的信息使用内联错误 (Inline Errors)。
*   **加载反馈**：本地部署网络延迟低，不使用全局骨架屏或 Loading Spinner，依靠微组件自身的兜底展示逻辑即可。
*   **空状态设计**：当 Dashboard 或列表为空时，展示空状态图标、文字说明以及“去创建”类引导按钮。
*   **未保存拦截**：当用户在 Integration 编辑器中修改了配置但在保存前尝试离开页面时，必须弹出确认框拦截路由。

### 4. 文档与代码审计要求 (Documentation Scope)
*   **架构设计文档**：对 `.planning/codebase/` 下的文档进行核实并做小幅修正，不进行全面重写。
*   **配置项文档化**：通过脚本提取 schema 自动生成配置文档。
*   **预设配置教程**：不编写独立的 Markdown 教程，确保 YAML 文件内部的注释足够详尽清晰。
*   **代码注释强制覆盖**：
    *   所有 Python API。
    *   所有 Step 执行逻辑 (需将 Step 拆分为独立模块并独立注释)。
    *   所有 React 微组件 (Micro-widgets)。

### 5. 新增内建通用微组件 (New Built-in Micro-components)
*   **图文/媒体卡片 (Media Card)**：需支持 img 封面图/头像、主/副标题。
*   **状态指示组件 (Badge)**：支持文字或纯色圆点。
*   **进度环 (Progress Ring)**：类似 Vercel 额度看板里的环形状进度条。
*   **趋势指示 (Trend)**：展示差值或趋势上涨/下跌。
*   **可点击包装器 (LinkWrapper)**：外链包装，用于包裹在任意组件或组件组合的可点击层。
*   **设计原则**：遵从通用化，分离展示类组件和包装组件，当做需要长期维护的 UI 库来设计。

## Code Context (受影响的核心范围)
- `ui-react/src/pages/Integrations.tsx`
- `ui-react/src/components/`
- `core/api.py`, `core/steps/` (重构后的 step 独立模块)
- `integrations/*.yaml` (预设与初始配置)
- `.planning/codebase/*.md`
- `docs/` (自动生成的配置说明)

## 递延需求 (Deferred Ideas)
- 关于依据不同数据源尽量涵盖不同类型微组件的新增需求（后续迭代再行详述）。