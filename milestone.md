Milestone 1.0: 跃迁 —— Glancier 正式版发布计划
一、 里程碑目标 (Milestone Objective)
将项目战略定位为面向重度数字用户的个人全能数据枢纽 (Personal Data Aggregator & Hub) —— Glancier。通过完成品牌重塑、文档重构、代码语义统一，并引入严格的 TDD (测试驱动开发) 规范，最终构建出一个稳定、高可用、可作为个人开源代表作展示的 v1.0 Release 版本。

二、 核心需求描述与痛点定义 (Problem & Solution)
1. 核心痛点：平台疲劳 (Platform Fatigue)
在碎片化的 SaaS 与 API 时代，用户饱受以下折磨：

工具蔓延：为了查看分布在数十个平台的额度、状态或指标，需要维护散落各处的凭证。
交互繁琐：忍受无休止的 Tab 切换、复杂的认证流程（OAuth/登录/滑块）。
数据孤岛：由于很多平台不开放 API 或存在严格的反爬风控，传统 Dashboard 工具（如 GlanceApp、Homarr）无法触达这些数据。
2. 解决方案：Glancier
摒弃传统的被动式静态面板，打造一个自带强抓取与 AI 清洗能力的 Headless 引擎与高密度可视化客户端。帮用户把所有脏活累活在后台处理完，前台只需“极简一瞥”。

3. 最主要的特色/竞争点 (Unfair Advantages)
突破封锁的多模态抓取 (Multi-modal Fetching)：内置交互式 Flow 状态机，支持基础 HTTP、OAuth 续期，以及强大的 WebView 模拟人工抓取。遇到风控可优雅挂起，请求 UI 协助，彻底打破“无 API 则无数据”的死局。
*此处为2.0 AI agent版本奠定底层基础* AI 洗选优先的智能折叠层 (AI-First Data Washing)：告别手写复杂的 JSON 解析或模板正则。利用 AI Agent 抽离源数据的核心 Meta 信息，将千奇百怪的输入标准化，具备极强的数据容错弹性。
Local-First 的极简便当盒 UI (The Bento Grid)：配置与密钥基于 AES-256 加密存在本地。彻底抛弃老旧运维风格，采用 2026 前端最新趋势的 High-Density Minimalist（高密度极简），构建可高度自定义的 Bento 流体网格系统。
配置即一切 (Configuration as Code)：接入新平台零 Python 后端修改，全生命周期由 Integration YAML与 View Template 驱动。
三、 落地任务拆解 (Task Breakdown)
Phase 1: 品牌与精神重塑 (Rebranding & Documentation)
核心目标：清理旧有心智模型，确立新的术语标准并体现在文档中。

1.1 术语表更新 (Glossary Refactoring):
统一术语定义为更有泛用性的 Metric、Signal 与 Integration Data。
明确 Flow、Agent、Widget 在 Glancier 语境下的精准定义。
1.2 文档全面翻新:
重写 /docs/ 下的架构说明，引入上述提到的竞品分析思路。
重写 PROJECT.md 和 README.md，使用最新的“痛点-方案-特色”三段式结构破题。
Phase 2: 代码语义更新与组件重构 (Codebase Semantic Update)
核心目标：将设计理念落实到代码库，消除项目中的“技术债”与“命名债”。

2.1 品牌更名，ICON更新，品牌色更新。
2.2 全局变量与配置更名:
统一项目级别命名空间（本地数据目录统一为 `~/.glancier`）。
统一环境变量前缀与存储键命名为 `GLANCIER_`。
2.3 UI 组件与路由优化:
梳理 React 组件，将历史业务色彩较强的类名/文件名重构为通用抽象（如 MetricCard, BentoWidget）。
优化 AppHeader 与侧边栏/顶栏，确保视觉契合“高密度极简”风格。
Phase 3: 测试覆盖与 TDD 规范确立 (Test Coverage & TDD)
核心目标：为 1.0 稳定版保驾护航，建立一套可持续集成的现代测试流程。

3.1 确立 TDD 工作流规范:
形成文档明确规范：先写预期输入/输出 (Red)，再实现逻辑 (Green)，最后重构 (Refactor)。
3.2 核心引擎的单元与集成测试 (Backend/Python):
Flow 执行器测试：针对多模态（HTTP/WebView/OAuth）步骤解析的正确性测试。
状态机切换测试：模拟断网、Token过期、缺少参数时的容错挂起与恢复测试。
加密层测试：AES-256 加解密与持久化的边界条件测试。
3.3 前端组件与交互测试 (Frontend/React+Tauri):
针对核心组件（FlowHandler、BentoGrid 渲染器）的 Jest / React Testing Library 单元测试。
确保视图模板 (View Templates) 解析数据为空时的防白屏 Fallback 渲染测试。
Phase 4: Release v1.0 稳定版发版 (Build & Release)
核心目标：完成端到端打磨，交付可直接对外展示的安全、流畅的客户端。

4.1 核心流程端到端 (E2E) 验证:
使用预设的 2-3 个代表性 Integration（如：1个 GitHub OAuth，1个 API Key，1个 WebView 抓取）走通全链路。
4.2 CI/CD 构建流水线:
配置 GitHub Actions，实现 Tauri macOS/Windows 等全自动打包。
4.3 性能与安全审计:
排查本地密钥存储安全漏洞。
优化 React 渲染性能（使用 Vercel React Best Practices 规范审计）。
