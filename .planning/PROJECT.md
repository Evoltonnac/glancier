# PROJECT - Glancier (formerly Quota Board)

## 1. 项目定位 (Project Positioning)

Glancier (原 Quota Board) 是一个面向重度数字用户的个人全能数据枢纽 (Personal Data Aggregator & Hub)。
摒弃传统的被动式静态面板，打造一个自带强抓取与 AI 清洗能力的 Headless 引擎与高密度可视化客户端。帮用户把所有脏活累活在后台处理完，前台只需“极简一瞥”。

项目致力于将分散在各处的 API 数据与网页信息转化为统一的**指标 (Metrics)** 与**信号 (Signals)**。

## 2. 核心竞争点 (Unfair Advantages)

- **突破封锁的多模态抓取 (Multi-modal Fetching)**：内置交互式 Flow 状态机，支持基础 HTTP、OAuth 续期，以及强大的 WebView 模拟人工抓取。遇到风控可优雅挂起，请求 UI 协助，彻底打破“无 API 则无数据”的死局。
- **AI 洗选优先的智能折叠层 (AI-First Data Washing) (奠基中)**：告别手写复杂的 JSON 解析或模板正则。利用 AI Agent 抽离源数据的核心 Meta 信息，将千奇百怪的输入标准化，具备极强的数据容错弹性。
- **Local-First 的极简便当盒 UI (The Bento Grid)**：配置与密钥基于 AES-256 加密存在本地。彻底抛弃老旧运维风格，采用 2026 前端最新趋势的 High-Density Minimalist（高密度极简），构建可高度自定义的 Bento 流体网格系统。
- **配置即一切 (Configuration as Code)**：接入新平台零 Python 后端修改，全生命周期由 Integration YAML 与 View Template 驱动。

## 3. 当前状态 (v1.0 Milestone in Progress)

- **Shipped v0.1**：核心链路已打通。在不修改 Python 业务代码的前提下，通过配置完成「鉴权 -> 采集 -> 解析 -> 展示」全链路接入。UI 完成了高密度、响应式的看板重构。
- **v1.0 跃迁**：进行品牌与精神重塑、代码语义更新与组件重构，引入严格的 TDD 测试覆盖规范，将原有的“额度监控”概念全面升级为“个人数据聚合”，最终交付稳定高可用的正式版客户端。

## 4. 全局目标 (Source of Truth 提炼)

1. 建立一个不依赖硬编码平台逻辑的通用采集与展示框架。
2. 让“接入新平台”的主要工作落在配置层（Flow + Templates），而不是改后端代码。
3. 通过统一的运行时状态机（active/suspended/error/config_changed）处理鉴权、交互、异常与恢复。
4. 提供可复用的视图模板与微组件（Micro-Widgets）机制，实现高密度、可组合的监控看板。
5. 以本地优先（TinyDB + JSON + Tauri）保障个人使用场景下的可控性与轻量性。

## 5. 核心价值（One Thing That Must Work）

在不修改 Python 业务代码的前提下，用户可以通过配置完成「鉴权 -> 采集 -> 解析 -> 展示」全链路接入，并稳定看到正确数据。

## 6. 业务范围（In Scope）

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

## 7. 非目标（Out of Scope）

1. 企业多租户、团队协作、权限体系、SaaS 云托管能力。
2. 直接让前端读取本地数据文件（必须经后端 API）。
3. 在微组件中承载业务状态机逻辑（鉴权/连接异常等由壳层统一处理）。

## 8. 关键约束（Constraints）

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

## 9. 当前测试基线（非平台白名单）

1. API Key + Fetch：已验证 OpenRouter endpoints。
2. cURL 逆向 / WebView Scraper：已验证 Soniox 等无直接支持平台场景。
3. OAuth：代表性测试源确定为 GitHub OAuth，作为标准 OAuth 回归样本。

## 10. 成功判定（Project-Level）

1. 用户可在不写后端代码的情况下，新增并运行至少一种新平台集成。
2. 数据源异常/鉴权缺失时可进入可恢复状态，而非导致系统整体不可用。
3. 看板可以基于模板稳定渲染关键指标，并在数据缺失时保持可用。
4. 本地桌面模式与开发模式均可独立启动并完成端到端采集展示。

## 11. 事实来源 (Source of Truth)

1. `docs/terminology.md`
2. `README.md`
3. `Agent.md`
4. `CONFIG.md`
5. `docs/flow_configuration.md`
6. `docs/view_micro_widget_architecture.md`
7. `docs/webview_scraper_architecture.md`
8. `docs/view_template_configuration.md`
9. `docs/custom_design_prompt.md`

