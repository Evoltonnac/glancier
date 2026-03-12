# Glancier

**Glancier** 是一个**配置驱动**的通用型**个人数据聚合器与中心 (Personal Data Aggregator & Hub)**。

它允许用户通过简单的 YAML 配置文件 (Flows) 接入任意第三方 API 或网页数据（如 OpenAI 使用量、GitHub 贡献、服务器状态等），自动定时采集数据，并基于 **Bento Grid** 哲学在现代化 Web 看板中实时展示各项指标 (Metrics) 与信号 (Signals)。

## 核心特性

- **零代码集成 (Flow-based)**：通过 YAML 定义请求流，支持复杂的鉴权 (OAuth, API Key, Cookies) 与数据提取 (JSONPath, CSS Selector)。
- **Bento Grid 视觉哲学**：采用模块化、高密度的卡片布局，让所有重要信息一目了然 (At-a-glance)。
- **多样化微组件 (Micro-Widgets)**：提供进度条 (Progress Bars)、状态信号 (Signals)、趋势图表 (Charts) 等多种展示方式。
- **本地优先与隐私保护**：所有配置、密钥与采集到的数据均存储在本地，支持 AES-256 加密。
- **跨平台桌面支持**：基于 Tauri v2 构建，提供轻量级的 macOS/Windows/Linux 客户端，并内置 Python 驱动引擎。

## 项目结构

```
glancier/
├── main.py                     # 统一入口：FastAPI 服务 + APScheduler 调度器
├── config/                     # YAML 配置文件
│   ├── integrations/           # 集成定义 (Flows + View Templates)
│   └── sources/                # 数据源实例配置
├── core/                       # 后端核心逻辑
│   ├── auth/                   # 鉴权策略 (API Key, OAuth, PKCE)
│   ├── executor.py             # 任务执行引擎 (采集管道)
│   ├── parser.py               # 数据解析器 (JSON/HTML/Regex)
│   ├── resource_manager.py     # 资源管理器 (Sources/Views)
│   └── api.py                  # REST API 定义
├── ui-react/                   # 前端 (React + Vite + Tailwind CSS)
│   ├── src/                    # UI 组件与页面
│   ├── src-tauri/              # Tauri 桌面壳
│   └── package.json
└── data/                       # 本地运行时数据 (GLANCIER_DATA_DIR)
    ├── sources.json            # 已配置的数据源
    ├── views.json              # 看板视图布局
    ├── data.json               # 最新采集的数据与状态
    ├── secrets.json            # 加密存储的密钥
    └── settings.json           # 设备专属设置
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **配置层** | PyYAML + Pydantic v2 | 配置加载与类型安全 |
| **驱动层** | FastAPI + APScheduler | 异步 API 服务与定时任务 |
| **采集层** | httpx + Playwright (via Tauri) | 高效的数据获取 |
| **解析层** | jsonpath-ng + BeautifulSoup4 | 结构化与非结构化数据提取 |
| **存储层** | TinyDB | 轻量级本地 NoSQL |
| **展现层** | React + Tailwind CSS | 响应式 Bento UI |
| **桌面层** | Tauri v2 + PyInstaller | 跨平台分发与 Sidecar 管理 |

## 快速开始

### 1. 环境准备

确保您的系统中已安装 Python 3.10+ 和 Node.js 18+。

```bash
# 安装 Python 依赖
pip install -r requirements.txt

# 安装前端依赖
cd ui-react && npm install
```

### 2. 运行开发服务器

```bash
make dev         # 同时启动前端与后端 (默认端口: 3000 & 8400)
# 或
make dev-tauri   # 同时启动后端与 Tauri dev
```

### 2.1 统一命令入口（推荐）

```bash
make help                     # 查看所有统一命令
make build-backend            # 仅准备 Python sidecar
make build-desktop            # 打包桌面应用
make test-impacted            # 按变更文件执行测试门禁
make clean-artifacts          # 清理构建产物
```

### 3. 创建您的第一个集成

您可以直接在 UI 的 "Integrations" 页面中使用内置编辑器创建新的 YAML 配置，或者参考 `config/integrations/` 下的示例文件。

## 术语表 (Terminology)

为了保持语义一致性，请参考 [docs/terminology.md](docs/terminology.md) 获取详细的命名空间定义。

- **Metric (指标)**：数值型数据，如 API 余额、存储用量。
- **Signal (信号)**：状态型数据，如在线状态、构建成功/失败。
- **Integration Data**：通过 Flow 获取的原始或加工后的信息。
- **Bento Card**：承载特定来源数据的 UI 容器。

## 测试与 TDD 门禁 (Phase 11)

后端核心模块采用强制 TDD（RED -> GREEN -> REFACTOR）流程；前端核心行为使用 `Vitest + React Testing Library` 作为阻断门禁。

常用命令：

```bash
# Backend core gate
make test-backend

# Frontend core gate
make test-frontend

# Frontend type gate
make test-typecheck

# Impacted-only gate (changed-file driven)
make test-impacted

# Minimal smoke path
python -m pytest tests/smoke/test_phase11_smoke.py -q
```

完整规则与命令矩阵见 [docs/testing_tdd.md](docs/testing_tdd.md)。

## 架构指引

- **UI 规范与设计红线**：[`docs/view_micro_widget_architecture.md`](docs/view_micro_widget_architecture.md)
- **配置架构详解**：[`CONFIG.md`](CONFIG.md)
- **构建路径与命令契约**：[`docs/build-path-contract.md`](docs/build-path-contract.md)
- **AI 助手编程规范**：[`Agent.md`](Agent.md)

## 许可

仅供个人非商业使用。
