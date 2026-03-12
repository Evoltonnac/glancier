# REQUIREMENTS - Glancier v1.0

## 1. 核心需求描述与痛点定义 (Problem & Solution)

**核心痛点：平台疲劳 (Platform Fatigue)**
在碎片化的 SaaS 与 API 时代，用户饱受以下折磨：
- 工具蔓延：为了查看分布在数十个平台的额度、状态或指标，需要维护散落各处的凭证。
- 交互繁琐：忍受无休止的 Tab 切换、复杂的认证流程（OAuth/登录/滑块）。
- 数据孤岛：由于很多平台不开放 API 或存在严格的反爬风控，传统 Dashboard 工具（如 GlanceApp、Homarr）无法触达这些数据。

**解决方案：Glancier**
摒弃传统的被动式静态面板，打造一个自带强抓取与 AI 清洗能力的 Headless 引擎与高密度可视化客户端。帮用户把所有脏活累活在后台处理完，前台只需“极简一瞥”。

## 2. 目标与范围 (Scope)

**In Scope:**
- 品牌重塑：统一项目文档与术语表到 Glancier 标准命名。
- 代码库更新：替换环境变量、存储键名、本地数据目录等项目级别的命名空间。
- UI 重构：梳理 React 组件，应用更通用的抽象（如 MetricCard, BentoWidget），契合高密度极简风格。
- 测试覆盖规范 (TDD)：为后端核心引擎（Flow 执行器、状态机、加密层）与前端核心组件编写单元与集成测试。
- E2E 验证：使用代表性 Integration (GitHub OAuth, API Key, WebView) 走通全链路。
- CI/CD：配置 GitHub Actions 自动构建 Tauri (macOS/Windows)。
- 性能与安全审计：排查密钥存储安全漏洞，优化 React 渲染性能。

**Out of Scope:**
- AI 数据清洗 (AI-First Data Washing) 的具体实现（在 v1.0 仅奠基，不作为发布强阻碍）。
- 后端数据存储架构重构。
- 复杂的用户认证或多租户支持。

## 3. 验收标准 (Acceptance Criteria)

- 项目所有公开文档和代码库中均已更新品牌名及相关术语。
- 测试覆盖率达到既定要求，所有新加的单元测试和集成测试必须通过。
- CI/CD 流程正常运作，能在 GitHub Actions 中自动产出 Tauri 稳定版本。
- 用户可平滑迁移并使用 v1.0 客户端管理和监控其各类平台数据。
