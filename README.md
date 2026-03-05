# Quota Board

个人资源监控看板 —— 一个**配置驱动**的通用额度/用量采集与展示系统。

通过 YAML 配置文件即可接入任意第三方 API（OpenAI、OpenRouter、Claude 等），自动定时采集数据并在 Web 看板中实时展示。

## 项目结构

```
quota-board/
├── main.py                     # 统一入口：FastAPI 服务 + APScheduler 调度器
├── requirements.txt            # Python 依赖清单
├── config/                     # YAML 配置文件（模块化组织）
│   ├── integrations/           # 集成方式定义（含视图模板）
│   └── sources/                # 数据源配置（可选）
├── core/                       # 所有后端业务逻辑
│   ├── config_loader.py        # YAML → Pydantic 配置模型解析器
│   ├── models.py               # Pydantic 数据模型（Sources/Views JSON）
│   ├── resource_manager.py     # JSON 文件管理器（Sources/Views）
│   ├── integration_manager.py  # Integration YAML 文件管理器
│   ├── auth/                   # 鉴权策略
│   │   ├── manager.py          # 鉴权策略分发器 + httpx 客户端池
│   │   ├── apikey_auth.py      # API Key / Header 注入（支持 ${ENV_VAR}）
│   │   └── oauth_auth.py       # OAuth 授权码流 + Token 持久化 + 自动刷新
│   ├── executor.py             # 任务执行器（APScheduler 定时调度 + 采集管道）
│   ├── parser.py               # 数据解析器（JSONPath / CSS Selector / Regex / Script）
│   ├── data_controller.py      # TinyDB 数据持久化（upsert + 历史记录）
│   └── api.py                  # FastAPI REST API 路由定义
├── ui-react/                   # 前端（React + Vite + Tailwind CSS）
│   ├── src/
│   │   ├── App.tsx             # 根组件（React Router 路由）
│   │   ├── api/                # API 客户端
│   │   ├── pages/              # 页面组件
│   │   │   └── Integrations.tsx # 集成管理页面（Monaco Editor）
│   │   └── types/              # TypeScript 类型定义
│   ├── src-tauri/              # Tauri v2 桌面应用壳
│   │   ├── src/lib.rs          # Tauri 入口（自动启动 Python sidecar）
│   │   └── tauri.conf.json     # Tauri 配置
│   └── package.json
├── scripts/
│   ├── dev_server.py           # 开发模式：watchdog 监控文件变更自动重启后端
│   └── build.sh                # 生产打包：PyInstaller + Tauri Build
└── data/                       # 数据文件目录（.gitignore 已忽略，建议只在本机存储）
    ├── sources.json            # 存储的数据源配置
    ├── views.json              # 存储的视图配置
    ├── data.json               # TinyDB 数据文件（运行时状态与历史数据）
    ├── secrets.json            # 密钥存储（API Key / Token 等，支持本地 AES-256 加密，使用 ENC: 前缀标识密文）
    └── settings.json           # 系统设置（开机自启 / 代理 / 密钥加密开关 & 本地主密钥），为当前设备专属配置
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **配置层** | PyYAML + Pydantic v2 | YAML 配置文件加载与类型校验 |
| **驱动层** | FastAPI + Uvicorn | REST API 服务（端口 8400） |
| | APScheduler | 定时任务调度（cron / interval） |
| | httpx | 异步 HTTP 客户端 |
| **解析层** | jsonpath-ng | JSON 响应字段提取 |
| | BeautifulSoup4 + lxml | HTML/CSS Selector 解析 |
| **存储层** | TinyDB | 轻量 NoSQL 本地存储 |
| **展现层** | React + Vite | 现代化 Web 看板 |
| | Tailwind CSS | 样式框架 |
| | Lucide React | 图标库 |
| | Recharts | 图表库 |
| **桌面应用** | Tauri v2 | 桌面打包 + Python Sidecar 管理 |
| | PyInstaller | 将 Python 后端打包为独立二进制 |

## 架构与数据流

> **📘 架构设计阅读指引：**
> - 关于**前端视图与微组件（Micro-Widget）**的详细落地方案与设计红线，请务必阅读：[`docs/view_micro_widget_architecture.md`](docs/view_micro_widget_architecture.md)
> - 关于**后端集成配置**的格式解析，请阅读：[`CONFIG.md`](CONFIG.md)

```
YAML (Integration + Templates) ──→ Config Loader ──→ Auth Manager ──→ Task Executor
                                          │
                                     Resource Manager
                                          │
                                    JSON Files (Sources/Views)
                                          │
                                          ↓
                                    FastAPI API
                                          │
                                   React 前端 (Vite)
                                          │
                                   Tauri 桌面应用壳
```

- **配置层**：YAML 定义 Integrations（含视图模板），JSON 定义 Sources/Views
- **驱动层**：FastAPI 提供 REST API，APScheduler 按配置定时执行采集管道（支持 HTTP/OAuth/Script/cURL 等步骤）
- **资源层**：ResourceManager 管理 JSON 文件存储
- **展现层**：React 前端通过 API 获取数据并动态渲染看板
- **桌面层**：Tauri v2 将前端 + 后端（Sidecar）打包为跨平台桌面应用

## 快速开始

### 1. 安装依赖

```bash
# Python 后端
pip install -r requirements.txt

# 前端
cd ui-react && npm install
```

### 2. 创建配置

在 `config/sources/` 目录下创建数据源配置文件。格式详见 [CONFIG.md](CONFIG.md)。

### 3. 设置环境变量

配置文件中的 API Key 支持 `${ENV_VAR}` 语法引用环境变量：

```bash
export OPENROUTER_API_KEY="sk-or-xxx"
```

### 4. 开发模式

```bash
cd ui-react

# 方法 A：前后端分开启动
npm run dev              # 前端 Vite 热更新 (localhost:3000)
npm run dev:backend      # 后端 watchdog 热更新 (localhost:8400)

# 方法 B：一条命令同时启动
npm run dev:all

# 方法 C：Tauri 桌面窗口开发模式（首次编译 Rust 较慢）
npm run tauri:dev
```

**热更新机制**：
- **前端**：`.tsx/.css` 变更 → Vite HMR 即时生效
- **后端**：`.py/.yaml` 变更 → watchdog 检测 → 自动重启 FastAPI（~1-2s）

### 5. 生产打包

```bash
cd ui-react
npm run tauri:build
```

自动执行：PyInstaller 打包 Python 后端 → Tauri 构建桌面安装包。

产物位于 `ui-react/src-tauri/target/release/bundle/`。

### 6. 仅启动后端（无桌面壳）

```bash
python main.py          # 默认端口 8400
python main.py 9000     # 自定义端口
```

## API 接口

后端启动后可通过 `http://localhost:8400/docs` 查看 Swagger 文档。

### 核心 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/sources` | 获取所有数据源列表及状态 |
| `POST` | `/api/sources` | 创建新的存储数据源 |
| `PUT` | `/api/sources/{id}` | 更新存储的数据源 |
| `DELETE` | `/api/sources/{id}` | 删除存储的数据源 |
| `GET` | `/api/data/{source_id}` | 获取指定数据源的最新数据 |
| `GET` | `/api/data/{source_id}/history` | 获取历史数据 |
| `POST` | `/api/refresh/{source_id}` | 手动触发单个数据源刷新 |
| `POST` | `/api/refresh` | 刷新全部启用的数据源 |

### 视图 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/views` | 获取所有存储的视图 |
| `POST` | `/api/views` | 创建新的存储视图 |
| `PUT` | `/api/views/{id}` | 更新存储的视图 |
| `DELETE` | `/api/views/{id}` | 删除存储的视图 |
| `GET` | `/api/views/config` | 获取视图布局配置 (Legacy) |

### Integration API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/integrations/{id}/templates` | 获取指定集成的视图模板 |
| `GET` | `/api/integrations/files` | 列出所有 Integration YAML 文件 |
| `GET` | `/api/integrations/files/{integration_id}` | 获取 Integration YAML 文件内容 |
| `POST` | `/api/integrations/files` | 创建新的 Integration YAML 文件 |
| `PUT` | `/api/integrations/files/{integration_id}` | 更新 Integration YAML 文件 |
| `DELETE` | `/api/integrations/files/{integration_id}` | 删除 Integration YAML 文件 |
| `GET` | `/api/integrations/files/{integration_id}/sources` | 获取使用指定集成的数据源列表 |
| `POST` | `/api/system/reload` | 重新加载配置，标记相关数据源为 CONFIG_CHANGED |

### 鉴权 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/sources/{source_id}/auth-status` | 查询鉴权状态 |
| `POST` | `/api/auth/apikey/{source_id}` | 运行时更新 API Key |
| `GET` | `/api/oauth/authorize/{source_id}` | 获取 OAuth 授权 URL |
| `POST` | `/api/sources/{source_id}/interact` | 处理交互请求（提交 API Key、OAuth 授权、cURL 命令等） |
| `GET` | `/api/config` | 获取当前配置摘要（脱敏） |

> **注意**：OAuth 回调由前端处理，URL 格式为 `{前端域名}/oauth/callback`

### 状态持久化

当数据源执行异常或需要用户交互时，运行时状态会自动持久化到 `data/data.json` 中：

| 字段 | 说明 |
|------|------|
| `status` | 当前状态：`active`（正常）、`suspended`（需交互）、`error`（错误）、`config_changed`（配置已更改） |
| `message` | 状态描述信息 |
| `interaction` | 交互请求详情，包含 `type`（如 `oauth_start`、`input_text`）和所需字段 |

### 系统设置与密钥加密架构

- **系统设置存储 (`data/settings.json`)**：用于保存当前设备的**客户端级配置**，包括：
  - 是否开机自启 (`autostart`)：通过 Tauri `tauri-plugin-autostart` 在桌面端生效，避免与后端逻辑耦合。
  - HTTP/HTTPS 代理 (`proxy`)：由 `core.settings_manager.SettingsManager` 统一读取，`core.executor.Executor` 在创建 HTTP 客户端时注入到 httpx 的 `proxies` 参数，仅影响 Python 后端的外部请求。
  - 密钥加密开关与主密钥 (`encryption_enabled` / `master_key`)：控制 `secrets.json` 是否使用本地 AES-256-GCM 加密存储。
- **密钥存储 (`data/secrets.json`)**：
  - 所有 API Key / OAuth Token 通过 `core.secrets_controller.SecretsController` 统一管理，每个 `secret_id` 作为顶层 key。
  - 当开启加密时，新写入的字段会使用 AES-256-GCM 加密，并以 `ENC:` 前缀标识密文（例如 `ENC:base64(...)`），读取时自动识别前缀并解密；关闭加密时则以明文存储。
  - 切换加密开关时，会触发一次**全量迁移**：从明文 → 加密（开启时）或从加密 → 明文（关闭时），即使中断也不会造成读取崩溃，因为读取逻辑始终自适应 `ENC:` 前缀。
- **主密钥与多端同步（方案 A）**：
  - 主密钥为随机生成的 256-bit AES 密钥（base64 编码），仅存储在本机 `settings.json` 中，不建议通过文件同步工具跨设备共享。
  - 后端提供 `/api/settings/master-key/export` 与 `/api/settings/master-key/import` 接口，对应前端“导出同步通行码 / 导入通行码”操作，用户可在设备间手动共享同一主密钥，以便在多端解密来自同一 `secrets.json` 的密文。
  - 如不希望跨端同步密钥，可选择仅同步视图与数据源配置（`sources.json` / `views.json` / `data.json`），在每台新设备重新输入一次 API Key（方案 B）。

前端可通过 `/api/sources` 获取这些信息，渲染对应的授权按钮或输入表单。

## 扩展新数据源

### 方式一：使用 Web 界面（推荐）

1. 启动前端服务后，在浏览器中访问 `/integrations` 页面
2. **管理 Integration**：
   - 点击侧边栏的 `+` 按钮创建新的 Integration YAML 文件
   - 使用 Monaco Editor 编辑 YAML 内容（支持 Ctrl+S 保存）
   - 删除不需要的 Integration
3. **创建 Source**：
   - 选中一个 Integration 后，在下方 "Sources using this integration"区域
   - 点击 "Create Source" 按钮，输入数据源名称
   - 系统会自动生成 ID 并创建 JSON 配置文件
4. 配置更改后会自动触发系统重载，相关数据源状态会变为 `config_changed`

### 方式二：手动配置

1. **定义 Integration**：在 `config/integrations/` 目录中添加 YAML 文件，定义 Flow 编排和视图模板
2. **创建 Source**：调用 `POST /api/sources` API 创建数据源实例
3. **创建 View**：调用 `POST /api/views` API 创建视图布局

配置格式详见 [CONFIG.md](CONFIG.md)。

## 许可

仅供个人使用。
