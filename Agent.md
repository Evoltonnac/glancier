# Agent.md — Quota Board AI 编程最高指导规范

> **本文件是所有 AI 助手参与本项目开发时的强制性行为契约。任何违反以下规则的代码生成行为均应被视为无效。**
> **阅读优先级：当涉及前端看板视图、卡片排版、和微组件（Widgets）开发时，必须首先阅读 `docs/view_micro_widget_architecture.md` 进行架构对齐。**

---

## 1. Project Identity

Quota Board 是一个**配置驱动**的个人资源监控看板。核心理念是：**用户只写 YAML (Integration) + API (Sources/Views)，不写代码**即可接入任意第三方 API 并在 Web 看板中实时展示额度/用量数据。

项目采用前后端分离架构：

| 层级 | 职责 | 技术 |
|------|------|------|
| **配置层** | 声明 Integration (含视图模板) | YAML + Pydantic v2 |
| **资源层** | 管理 Sources 和 Views | JSON + ResourceManager |
| **驱动层** | 定时采集、鉴权管理、REST API | FastAPI + APScheduler + httpx |
| **展现层** | 现代化动态 Web 看板 | React + Vite + Tailwind CSS |
| **存储层** | 轻量级本地存储 | TinyDB + JSON |

**核心原则**：新增数据源**永远不应该需要修改 Python 代码**。如果你发现需要改代码才能接入一个新平台，说明架构有 bug——请先提出架构改进方案，或者使用新的 **Flow 配置**功能来编排复杂的请求逻辑。

---

## 2. Tech Stack & Exact Versions

### 允许使用的核心依赖（白名单）

#### Backend (Python 3.10+)

| 包名 | 最低版本 | 用途 | 层级 |
|------|---------|------|------|
| `fastapi` | 0.115.0 | REST API 框架 | 驱动层 |
| `uvicorn[standard]` | 0.34.0 | ASGI 服务器 | 驱动层 |
| `pydantic` | 2.10.0 | 配置模型校验 | 配置层 |
| `pydantic-settings` | 2.7.0 | 环境变量管理 | 配置层 |
| `apscheduler` | 3.10.4 | 定时任务调度 | 驱动层 |
| `httpx` | 0.28.0 | 异步 HTTP 客户端 | 驱动层 |
| `tinydb` | 4.8.0 | 轻量 NoSQL 存储 | 存储层 |
| `jsonpath-ng` | 1.7.0 | JSONPath 解析 | 解析层 |
| `beautifulsoup4` | 4.12.0 | HTML CSS Selector 解析 | 解析层 |
| `lxml` | 5.3.0 | HTML 解析后端 | 解析层 |
| `pyyaml` | 6.0.2 | YAML 配置加载 | 配置层 |

#### Frontend (Node.js / React)

| 包名 | 版本 | 用途 |
|------|------|------|
| `vite` | ^6.0.0 | 构建工具 & 开发服务器 |
| `react` | ^18.3.0 | UI 框架 |
| `tailwindcss` | ^3.4.0 | 样式框架 |
| `lucide-react` | ^0.468.0 | 图标库 |
| `recharts` | ^2.15.0 | 图表库 |

### ⛔ 严格禁令

- **严禁引入白名单外的核心包**。需要新依赖必须先询问。
- **严禁捏造 API**。不确定时必须询问。
- **严禁随意升级/降级版本**。
- **严禁在前端硬编码业务逻辑**。前端仅负责展示，逻辑由后端 API 提供。

---

## 3. Architectural Guardrails（架构防腐层）

### 3.1 目录结构规范

```
quota-board/
├── main.py                  # Backend 入口，启动 API 和调度器
├── config/                  # 仅存放 YAML 配置文件 (Integrations)
├── core/                    # 所有后端业务逻辑
│   ├── config_loader.py     # Pydantic 配置模型
│   ├── models.py            # Pydantic 数据模型
│   ├── resource_manager.py   # JSON 文件管理器
│   ├── auth/                # 鉴权策略
│   ├── executor.py          # 采集管道 + 调度
│   ├── parser.py            # 解析器
│   ├── data_controller.py   # TinyDB 操作
│   └── api.py               # FastAPI 路由
├── ui-react/                # Modern Desktop Frontend (Tauri + React + Vite)
│   ├── src-tauri/           # Tauri Rust Backend (用于 WebView 原生交互等)
│   ├── src/
│   │   ├── components/      # UI 组件
│   │   ├── lib/             # 工具函数 (API client 等)
│   │   └── App.tsx          # 根组件
│   └── package.json
└── data/                    # 运行时数据（.gitignore 已忽略，视为本机私有）
    ├── sources.json         # 存储的数据源配置
    ├── views.json           # 存储的视图配置
    ├── data.json            # TinyDB 数据文件（运行时状态与历史数据）
    ├── secrets.json         # 密钥存储（API Key / Token 等，支持本地 AES-256 加密，使用 ENC: 前缀）
    └── settings.json        # 系统设置（开机自启 / 代理 / 密钥加密开关 & 本地主密钥），为当前设备专属，不建议跨端同步
```

**强制规则**：
- **后端**：
    - 新增鉴权 → `core/auth/`
    - 新增解析 → `core/parser.py`
    - 新增 API → `core/api.py`
    - `main.py` 仅负责应用初始化和依赖注入，核心业务逻辑应放在 `core/` 模块中。
- **前端**：
    - UI 逻辑 → `ui-react/src/`
    - 数据获取 → 通过 `fetch` 调用 `http://localhost:8400/api/...`
    - **禁止**直接读取后端本地文件（如 `data.json`），必须走 API。

### 3.2 状态管理规范

- **后端**：全局状态仅存在于 `main.py` 的 lifespan 中，通过依赖注入传递给 API。
- **前端**：使用 React Hooks (`useState`, `useEffect`) 管理组件状态。
- **持久化**：TinyDB 是唯一的数据源，API 是唯一的访问入口。

### 3.3 代码长度红线

| 度量 | 红线 | 触发动作 |
|------|------|---------|
| 单函数行数 | > 50 行 | **必须建议拆分** |
| 单文件行数 | > 300 行 | **必须建议拆分** |
| 单次修改文件数 | > 5 个 | **必须先列出修改计划** |

---

## 4. Vibe Coding Workflow（工作流契约）

### 4.1 强制循环：Define → Generate → Verify

#### Step 1: Define（定义）
- 明确目标：是改后端配置？还是改前端 UI？
- 确认影响范围。

#### Step 2: Generate（生成）
- 最小化修改。
- 优先 Search-Replace。

#### Step 3: Verify（验证）
- **Backend 验证**：
    - `curl http://localhost:8400/api/sources` 确认数据源。
    - 检查 Backend 日志。
- **Frontend 验证**：
    - 确保 `npm run dev` 无报错。
    - 确认 UI 元素正确渲染。

### 4.2 禁止行为
- ⛔ **禁止未经允许修改依赖文件** (`requirements.txt`, `package.json`)。
- ⛔ **禁止生成占位符代码**。

### 4.3 修改 YAML Schema 流程
1. 说明新增字段。
2. 修改 `core/config_loader.py`。
3. 同步 `config/config.example.yaml`。
4. 同步 `CONFIG.md`。

---

## 5. Debugging & Logging（错误处理与日志）

### 5.1 后端日志
- 使用 `logging.getLogger(__name__)`。
- 关键操作（鉴权、API请求、解析）必须记录。
- 错误必须记录 `logger.error`。

### 5.2 错误处理
- **单个数据源失败不阻塞整体**。
- `try-except` 必须包含日志记录。
- API 层使用 `HTTPException` 返回 4xx/5xx 状态码。

---

## 6. 文档同步契约

| 文件 | 何时需要更新 |
|------|-------------|
| `README.md` | 技术栈变更、启动方式变更 |
| `CONFIG.md` | 配置 Schema 变更 |
| `ui-react/README.md` | 前端特定说明 |
| `Agent.md` | 架构重大变更 |

---

## 7. 速查清单

- [ ] 后端修改是否验证了 API 响应？
- [ ] 前端修改是否兼容了现有 API？
- [ ] 是否保持了前后端分离（无越界调用）？
- [ ] 是否处理了空数据/加载中状态？
- [ ] 是否同步更新了 YAML 示例？
