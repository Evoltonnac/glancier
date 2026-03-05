# PROJECT - Quota Board

## 1. 项目定位

Quota Board 是一个面向个人开发者/重度 API 用户的「配置驱动额度监控看板」系统。  
用户通过 Integration YAML + Source/View API 配置，即可接入任意可访问接口的平台额度、用量和状态数据，并在 Web/Tauri 看板中统一展示。

## 2. 全局目标（Source of Truth 提炼）

1. 建立一个不依赖硬编码平台逻辑的通用采集与展示框架。
2. 让“接入新平台”的主要工作落在配置层（Flow + Templates），而不是改后端代码。
3. 通过统一的运行时状态机（active/suspended/error/config_changed）处理鉴权、交互、异常与恢复。
4. 提供可复用的视图模板与微组件（Micro-Widgets）机制，实现高密度、可组合的监控看板。
5. 以本地优先（TinyDB + JSON + Tauri）保障个人使用场景下的可控性与轻量性。

## 3. 核心价值（One Thing That Must Work）

在不修改 Python 业务代码的前提下，用户可以通过配置完成「鉴权 -> 采集 -> 解析 -> 展示」全链路接入，并稳定看到正确数据。

## 4. 业务范围（In Scope）

1. Integration YAML 管理：定义 `flow` 步骤与 `templates` 视图模板。
2. Source/View 资源管理：通过 REST API 进行创建、更新、删除与查询。
3. Flow 执行引擎：支持 `api_key/oauth/curl/webview/http/extract/script/log` 步骤编排。
4. 交互式执行暂停与恢复：当缺少鉴权信息时挂起并等待 UI 交互，补齐后恢复执行。
5. 数据持久化：
   - 运行时状态与最新采集结果：`data/data.json`
   - 资源定义：`data/sources.json`、`data/views.json`
   - 密钥：`data/secrets.json`
   - 系统设置：`data/settings.json`
   - v1 暂不扩展历史留存策略（后续可能随存储架构重构统一设计）
6. 安全能力：本地 AES-256-GCM 密钥加密（`ENC:` 前缀）与主密钥导入导出。
7. 看板渲染：
   - Base Source Card 统一壳层
   - Widgets 配置驱动渲染
   - 模板字符串动态求值与列表过滤/排序/分页
8. 桌面化运行：Tauri sidecar 管理 Python 后端，支持开发与生产打包流程。
9. 部署组合支持（以桌面优先）：
   - 完整客户端（桌面 + 本地 Python，功能完整，数据本地）
   - 客户端 + Python 上云（功能完整，数据上云，多端客户端共享）
   - Web + 本地 Python（无 WebView 安全抓取能力，数据本地）
   - Web + Python 上云（无 WebView 安全抓取能力，数据上云）

## 5. 非目标（Out of Scope）

1. 企业多租户、团队协作、权限体系、SaaS 云托管能力。
2. 直接让前端读取本地数据文件（必须经后端 API）。
3. 在微组件中承载业务状态机逻辑（鉴权/连接异常等由壳层统一处理）。

## 6. 关键约束（Constraints）

1. 架构约束：前后端分离，API 是唯一数据访问入口。
2. 可扩展性约束：新增数据源不应要求修改 Python 代码；若出现此情况，应优先修正架构/Flow 能力。
3. Flow 约束：
   - 变量优先级：`outputs > context > secrets`
   - 鉴权头与 secrets 存储均为显式声明，不允许隐式注入/隐式保存
4. UI 架构约束：
   - 微组件必须是无状态展示组件
   - 缺失/null 数据必须优雅降级，不得导致白屏或 TypeError
   - 外边距由父布局控制，组件避免外部 margin
5. 技术栈约束：核心依赖遵循白名单与既定版本策略，禁止随意引入/升级核心包。
6. 数据与使用约束：
   - 数据目录默认本机私有，建议不直接跨端同步主密钥文件
   - 项目许可定位为“仅供个人使用”
7. 调度与超时约束（v1）：
   - 默认采集频率建议为 30 分钟（兼顾时效与请求负担）
   - `webview`/`curl` 来源建议默认 60 分钟（减少风控与资源压力）
   - 支持按 source 覆盖默认频率
   - Step 超时按工具类型区分：`http/fetch` 默认 10s，`webview scraper` 默认 30s
8. 合规约束（v1）：
   - 对 `curl`/`webview` 仅做 UI 提醒与确认引导
   - 暂不设置全局开关或域名白名单

## 7. 当前测试基线（非平台白名单）

1. API Key + Fetch：已验证 OpenRouter endpoints。
2. cURL 逆向 / WebView Scraper：已验证 Soniox 等无直接支持平台场景。
3. OAuth：代表性测试源确定为 GitHub OAuth，作为标准 OAuth 回归样本。

## 8. 成功判定（Project-Level）

1. 用户可在不写后端代码的情况下，新增并运行至少一种新平台集成。
2. 数据源异常/鉴权缺失时可进入可恢复状态，而非导致系统整体不可用。
3. 看板可以基于模板稳定渲染关键指标，并在数据缺失时保持可用。
4. 本地桌面模式与开发模式均可独立启动并完成端到端采集展示。

## 9. 事实来源（Source of Truth）

1. `README.md`
2. `Agent.md`
3. `CONFIG.md`
4. `docs/flow_configuration.md`
5. `docs/view_micro_widget_architecture.md`
6. `docs/webview_scraper_architecture.md`
7. `docs/view_template_configuration.md`
8. `docs/custom_design_prompt.md`
