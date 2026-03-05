# REQUIREMENTS - Quota Board (v1)

本文档基于既有文档事实抽取，不引入未证实功能。  
需求 ID 统一采用 `REQ-类别-序号`。

## A. 配置与集成（Configuration & Integration）

- [ ] `REQ-CFG-000` 平台接入策略必须保持平台无关性：只要存在可访问接口，即可通过配置接入，不维护固定平台白名单。
- [ ] `REQ-CFG-001` 系统必须自动扫描并加载 `config/integrations/` 下的 Integration YAML 文件。
- [ ] `REQ-CFG-002` 每个 Integration 必须支持定义 `id/name/description/flow/templates`。
- [ ] `REQ-CFG-003` Flow 必须支持步骤类型：`api_key`、`oauth`、`curl`、`webview`、`http`、`extract`、`script`、`log`。
- [ ] `REQ-CFG-004` Flow 变量解析必须遵循优先级：`outputs > context > secrets`，并支持 `{var}` 模板语法。
- [ ] `REQ-CFG-005` Flow 必须采用显式安全策略：Authorization 头与 secrets 存储均需显式配置，不允许隐式注入/持久化。
- [ ] `REQ-CFG-006` 视图模板字段必须支持动态模板求值（纯值绑定与字符串插值）。
- [ ] `REQ-CFG-007` v1 测试基线必须覆盖三类接入路径：API Key + Fetch（已用 OpenRouter）、cURL/WebView（已用 Soniox 类场景）、OAuth（采用 GitHub OAuth 作为代表性测试源）。

## B. 执行引擎与交互（Execution & Interaction）

- [ ] `REQ-EXE-001` 系统必须支持定时执行采集任务（APScheduler）。
- [ ] `REQ-EXE-002` 当遇到交互型步骤（如 API Key/OAuth/WebView）且缺少必要凭据时，执行必须进入可恢复的暂停状态。
- [ ] `REQ-EXE-003` 交互信息补齐后，流程必须能从暂停点继续执行。
- [ ] `REQ-EXE-004` 单个数据源失败不得阻塞其他数据源的执行。
- [ ] `REQ-EXE-005` 数据源运行状态必须持久化并至少包含：`active`、`suspended`、`error`、`config_changed`。
- [ ] `REQ-EXE-006` 默认采集频率应为 30 分钟，并允许按 source 覆盖。
- [ ] `REQ-EXE-007` `webview`/`curl` 场景默认采集频率应为 60 分钟（可覆盖）。
- [ ] `REQ-EXE-008` Step 超时策略按工具类型设定：`http/fetch` 默认 10s，`webview scraper` 默认 30s。

## C. 资源与数据存储（Resources & Persistence）

- [ ] `REQ-DATA-001` Source 配置必须通过 API 管理并持久化到 `data/sources.json`。
- [ ] `REQ-DATA-002` View 配置必须通过 API 管理并持久化到 `data/views.json`。
- [ ] `REQ-DATA-003` 运行时状态与最新采集结果必须持久化到 `data/data.json`（TinyDB）。
- [ ] `REQ-DATA-004` 密钥数据必须由 SecretsController 统一管理并持久化到 `data/secrets.json`。
- [ ] `REQ-DATA-005` 系统设置（开机自启、代理、加密开关、主密钥）必须持久化到 `data/settings.json`。
- [ ] `REQ-DATA-006` v1 不新增历史数据留存策略；历史存储重构留到后续里程碑。

## D. 安全与密钥（Security）

- [ ] `REQ-SEC-001` 开启加密时，敏感字段必须使用本地 AES-256-GCM 加密并以 `ENC:` 前缀标识。
- [ ] `REQ-SEC-002` 读取密钥时必须兼容密文/明文混合状态，保证开关切换期间可读性。
- [ ] `REQ-SEC-003` 系统必须支持主密钥导出与导入，以支持用户跨设备手动同步解密能力。
- [ ] `REQ-SEC-004` `curl`/`webview` 能力必须在 UI 显示合规风险提醒；v1 不引入全局禁用开关或域名白名单。

## E. API 合约（Backend API）

- [ ] `REQ-API-001` 必须提供 Sources 的 CRUD 与刷新接口（单个刷新和全量刷新）。
- [ ] `REQ-API-002` 必须提供最新数据查询接口；历史查询能力在 v1 不做新增扩展要求。
- [ ] `REQ-API-003` 必须提供 Views 的 CRUD 接口。
- [ ] `REQ-API-004` 必须提供 Integration 文件管理接口（列出、读取、创建、更新、删除、依赖源查询）。
- [ ] `REQ-API-005` 必须提供配置重载接口，并将受影响数据源标记为 `config_changed`。
- [ ] `REQ-API-006` 必须提供鉴权相关接口（授权 URL、鉴权状态、运行时交互提交等）。

## F. 视图与微组件（View & Micro-Widgets）

- [ ] `REQ-UI-001` 看板卡片必须采用 Base Source Card + Widgets Slots 的两层模型。
- [ ] `REQ-UI-002` 当数据源异常、离线或需鉴权时，必须由壳层统一渲染系统状态遮罩并暂停内部微组件渲染。
- [ ] `REQ-UI-003` 微组件必须保持无状态、仅负责展示，不得承载后端连接状态与鉴权异常逻辑。
- [ ] `REQ-UI-004` 微组件缺失数据时必须优雅降级（如显示 `--` 或折叠），不得触发前端崩溃。
- [ ] `REQ-UI-005` 列表型组件必须支持过滤、排序、限制数量或分页。
- [ ] `REQ-UI-006` Widgets 布局必须支持网格位置（`x/y/w/h`）与可选垂直配比（`row_span`）。
- [ ] `REQ-UI-007` 组件外间距必须由父布局管理，组件本身避免外部 margin 以保证组合一致性。

## G. 平台与运行模式（Platform）

- [ ] `REQ-PLT-001` 系统必须支持 Web 开发模式（前后端并行启动与热更新）。
- [ ] `REQ-PLT-002` 系统必须支持 Tauri 桌面开发模式并可自动管理 Python sidecar。
- [ ] `REQ-PLT-003` 生产构建流程必须支持 PyInstaller + Tauri 打包。
- [ ] `REQ-PLT-004` 平台优先级为桌面优先，因为 `webview scraper` 能力依赖桌面端。
- [ ] `REQ-PLT-005` 必须兼容四种部署组合：桌面+本地Python、桌面+云Python、Web+本地Python、Web+云Python。

## H. 架构与工程约束（Guardrails）

- [ ] `REQ-CON-001` 新增平台接入应优先通过配置完成，不应要求修改 Python 核心业务代码。
- [ ] `REQ-CON-002` 前端不得直接读取后端本地数据文件，必须通过后端 API。
- [ ] `REQ-CON-003` 核心依赖应遵循既定白名单与版本策略，变更需显式确认。
- [ ] `REQ-CON-004` `main.py` 仅负责应用初始化与依赖注入，核心逻辑应位于 `core/`。
- [ ] `REQ-CON-005` 项目使用定位为个人场景，不扩展为企业协作流程。

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-CFG-000 | Phase 1 | Pending |
| REQ-CFG-001 | Phase 1 | Pending |
| REQ-CFG-002 | Phase 1 | Pending |
| REQ-CFG-003 | Phase 1 | Pending |
| REQ-CFG-004 | Phase 1 | Pending |
| REQ-CFG-005 | Phase 1 | Pending |
| REQ-CFG-006 | Phase 1 | Pending |
| REQ-CFG-007 | Phase 6 | Pending |
| REQ-EXE-001 | Phase 2 | Pending |
| REQ-EXE-002 | Phase 2 | Pending |
| REQ-EXE-003 | Phase 2 | Pending |
| REQ-EXE-004 | Phase 2 | Pending |
| REQ-EXE-005 | Phase 2 | Pending |
| REQ-EXE-006 | Phase 2 | Pending |
| REQ-EXE-007 | Phase 2 | Pending |
| REQ-EXE-008 | Phase 2 | Pending |
| REQ-DATA-001 | Phase 4 | Pending |
| REQ-DATA-002 | Phase 4 | Pending |
| REQ-DATA-003 | Phase 2 | Pending |
| REQ-DATA-004 | Phase 3 | Pending |
| REQ-DATA-005 | Phase 3 | Pending |
| REQ-DATA-006 | Phase 3 | Pending |
| REQ-SEC-001 | Phase 3 | Pending |
| REQ-SEC-002 | Phase 3 | Pending |
| REQ-SEC-003 | Phase 3 | Pending |
| REQ-SEC-004 | Phase 6 | Pending |
| REQ-API-001 | Phase 4 | Pending |
| REQ-API-002 | Phase 4 | Pending |
| REQ-API-003 | Phase 4 | Pending |
| REQ-API-004 | Phase 4 | Pending |
| REQ-API-005 | Phase 4 | Pending |
| REQ-API-006 | Phase 4 | Pending |
| REQ-UI-001 | Phase 5 | Pending |
| REQ-UI-002 | Phase 5 | Pending |
| REQ-UI-003 | Phase 5 | Pending |
| REQ-UI-004 | Phase 5 | Pending |
| REQ-UI-005 | Phase 5 | Pending |
| REQ-UI-006 | Phase 5 | Pending |
| REQ-UI-007 | Phase 5 | Pending |
| REQ-PLT-001 | Phase 7 | Pending |
| REQ-PLT-002 | Phase 6 | Pending |
| REQ-PLT-003 | Phase 7 | Pending |
| REQ-PLT-004 | Phase 6 | Pending |
| REQ-PLT-005 | Phase 7 | Pending |
| REQ-CON-001 | Phase 1 | Pending |
| REQ-CON-002 | Phase 4 | Pending |
| REQ-CON-003 | Phase 1 | Pending |
| REQ-CON-004 | Phase 1 | Pending |
| REQ-CON-005 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 49 total
- Mapped to phases: 49
- Unmapped: 0

## 事实来源（Source of Truth）

1. `README.md`
2. `Agent.md`
3. `CONFIG.md`
4. `docs/flow_configuration.md`
5. `docs/view_micro_widget_architecture.md`
6. `docs/webview_scraper_architecture.md`
7. `docs/view_template_configuration.md`
8. `docs/custom_design_prompt.md`
