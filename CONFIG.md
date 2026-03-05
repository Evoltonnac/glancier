# CONFIG.md - 配置与集成指南 (Glancier)

本文档详细说明 **Glancier** (原 Quota Board) 的配置架构。

## 架构概述

Glancier 采用双层配置模式，旨在实现**个人数据聚合器**的灵活性：

1. **Integration (集成)**：YAML 配置文件，定义通用的数据获取逻辑 (**Flows**) 和视图模板 (**View Templates**)。
2. **Source & View (数据源与视图)**：JSON 文件（通过 API 管理），引用 Integration 并配置具体实例。

```
YAML (Flows + Templates) ──→ API/JSON (Sources + Views) ──→ Bento Grid UI
```

配置文件路径（Integration）：
- 多文件模式（推荐）：`config/integrations/` 目录下的所有 `.yaml` 文件会自动扫描并合并。
- 其他配置：`config/sources/` 目录用于存放数据源相关配置。

---

## 一、术语变更与兼容性说明 (Terminology & Compatibility)

随着从 "Quota Board" 到 "Glancier" 的品牌重塑，我们对配置中的术语进行了标准化。

### 1.1 核心术语映射

| 旧术语 | 新术语 (推荐) | 说明 |
|------|------------|------|
| Quota | **Metric** | 指标。数值型数据，如 `usage`, `balance`。 |
| Quota | **Signal** | 信号。状态型数据，如 `status`, `is_active`。 |
| Quota Board | **Glancier** | 项目名称。 |

### 1.2 Widget 类型重命名 (v1.0 迁移)

为符合 **Bento Grid** 设计哲学，以下 Widget 类型已重命名。

| 旧 `type` | 新 `type` (推荐) | 说明 |
|-----------|----------------|------|
| `quota_bar` | **`progress_bar`** | 进度条组件。 |
| `quota_card` | **`bento_card`** | (Legacy) 原配额卡片，建议拆分为多个微组件。 |
| `hero_metric` | **`hero_metric`** | 保持不变，用于突出显示核心指标。 |

**向后兼容性声明**：
在 v1.0 版本中，后端与前端将继续支持 `quota_bar` 和 `quota_card` 等旧名称。系统会自动将其映射到新的渲染逻辑，因此您现有的配置文件无需立即修改即可运行。但建议在新创建的集成中使用推荐的新名称。

---

## 二、集成配置 (`integrations`)

将通用的 API 请求逻辑抽离为模版，供多个数据源复用。

### 结构

```yaml
integrations:
  - id: <唯一标识符>
    name: <显示名称>
    description: <描述>
    flow:                    # Flow 编排步骤
      - ...
    templates:               # 视图模板列表
      - ...
```

### 视图模板 (`templates`)

在 Integration 中定义可复用的 UI 组件模板。

```yaml
integrations:
  - id: openrouter_keys
    templates:
      - type: hero_metric        # 核心指标
        field: total_usage
        label: "Total Usage"
        format: "${value:.4f}"
      - type: progress_bar       # 进度条 (原 quota_bar)
        field: usage_percent
        label: "Usage"
      - type: badge              # 状态信号 (信号)
        field: status
        label: "Status"
```

**支持的模板类型**：

| 类型 | 说明 |
|------|------|
| `hero_metric` | 核心大字指标 |
| `progress_bar` | 进度条 (替代 `quota_bar`) |
| `line_chart` | 折线图 |
| `badge` | 状态徽章 (用于信号) |
| `key_value_grid` | 键值对网格 |
| `stat_grid` | 统计网格 |

---

## 三、Flow 编排配置

当单一的 HTTP 请求无法满足需求时（例如需要先获取 Token 再请求数据，或需要 OAuth 授权后获取列表），使用 `flow` 定义一系列有序的执行步骤。

### 2.1 变量作用域与优先级

Flow 执行引擎支持三种变量类型，并按优先级检索：

| 优先级 | 类型 | 作用域 | 说明 |
|--------|------|--------|------|
| 1 | `outputs` | 单步变量 | 仅传递给下一步，步骤执行完毕后不可再访问 |
| 2 | `context` | 全局变量 | 持久化在整个流程中，后续所有步骤均可访问 |
| 3 | `secrets` | 密钥存储 | 来自 `SecretsController`，用于长期存储的凭证 |

#### 变量引用语法

在 `args` 中使用 `{variable_name}` 语法引用变量：

```yaml
- id: fetch_data
  use: http
  args:
    url: "https://api.example.com/users/{username}"
    headers:
      Authorization: "Bearer {access_token}"
```

#### outputs - 单步变量

定义在步骤的 `outputs` 字段中，仅在下一步中有效：

```yaml
- id: get_token
  use: http
  args:
    url: "https://auth.example.com/token"
    method: POST
  outputs:
    json.access_token: access_token  # 保存到 access_token 变量

- id: get_data
  use: http
  args:
    url: "https://api.example.com/data"
    # 在这里可以使用 {access_token}，因为它是上一步的 outputs
```

#### context - 全局变量

初始值为 `source.vars`，可通过步骤 outputs 逐步累加。持久化在整个流程中。

#### secrets - 密钥存储

用于长期存储敏感信息（如 Token）。需要在步骤中显式声明 `secrets` 字段（以键值对形式）才会存储：

- 实际存储载体为 `data/secrets.json`，由 `SecretsController` 统一管理。
- 是否加密存储由系统设置中的 `encryption_enabled` 决定：开启时使用本地 AES-256-GCM 加密，并以 `ENC:` 前缀标识密文；关闭时以明文存储，但读取逻辑始终兼容 `ENC:` 前缀，便于在多端或切换过程中保持稳定。

```yaml
- id: oauth_auth
  use: oauth
  args:
    auth_url: "https://auth.example.com/authorize"
    token_url: "https://auth.example.com/token"
  outputs:
    access_token: "access_token"
  secrets:
    access_token: "access_token"  # 显式声明：将步骤内部变量 access_token 存储为密钥名称 access_token 到 SecretsController
```

> **注意**：Flow 模式移除了隐式的 Authorization 头注入和隐式的 secrets 存储。必须在步骤中显式定义 `headers` 和 `secrets`。

### 2.2 Flow 完整示例

```yaml
integrations:
  - id: openrouter_keys_apikey
    name: "OpenRouter Keys List (API Key)"
    description: "Fetch all API keys and their usage via Management API Key"

    flow:
      # Step 1: Authentication (Get API Key)
      - id: auth
        use: api_key
        secrets:
          api_key: "access_token" # 显式存储 api_key 到 SecretsController
        args:
          label: "Management API Key"
          description: "Input your OpenRouter Management API Key"
        outputs:
          api_key: "access_token"

      # Step 2: Fetch Keys List (with explicit Authorization header)
      - id: fetch
        use: http
        args:
          url: "https://openrouter.ai/api/v1/keys"
          method: "GET"
          headers:
            Authorization: "Bearer {access_token}"
        outputs:
          http_response: "http_response"

      # Step 3: Extract Data
      - id: parse
        use: extract
        args:
          source: "{http_response}"
          type: "jsonpath"
          expr: "$.data"
        outputs:
          keys_list: "keys_list"
```

### 2.3 步骤类型 (`use`)

| 类型 | 说明 |
|------|------|
| `api_key` | 获取用户输入的 API Key |
| `oauth` | 处理 OAuth 授权和 Token 获取 |
| `curl` | [新增] 解析用户输入的 cURL 命令获取头信息 |
| `webview` | [新增] 后台无头浏览器拦截请求和执行脚本提取 |
| `http` | 发送 HTTP 请求 |
| `extract` | 数据提取（JSONPath / Key） |
| `script` | [新增] 运行自定义 Python 脚本进行复杂数据处理 |
| `log` | 打印日志（调试用） |

---

## 四、步骤类型详解

### `api_key` - API Key 注入

用于获取用户输入的 API Key。

- `secrets`:
  - `api_key`: string (必填，保存的密钥名称ID)
- `args`:
  - `label`: string (前端显示的标签)
  - `description`: string (可选，描述信息)
- `outputs`:
  - `api_key`: 将密钥值暴露给后续步骤

### `http` - 发送 HTTP 请求

发送 HTTP 请求。**注意**：必须显式在 `headers` 中定义 `Authorization` 头，不会自动注入。

- `args`:
  - `url`: string (必填)
  - `method`: GET | POST (默认 GET)
  - `headers`: dict (显式定义请求头)
  - `params`: dict
  - `body`: dict (JSON body)
  - `timeout`: float
- `outputs`:
  - `http_response`: 整个响应 JSON 对象
  - `raw_data`: 响应文本
  - `headers`: 响应头字典

### `oauth` - OAuth 流程

用于处理 OAuth 授权和 Token 获取。

- `args`:
  - `auth_url`: string
  - `token_url`: string
  - `doc_url`: string (可选，用于向用户展示如何创建 OAuth 应用)
  - `scopes`: list
  - `supports_pkce`: bool (可选，是否支持 PKCE，默认 true)
  - `token_request_type`: string (可选，`form` 或 `json`)
- `outputs`:
  - `access_token`: 获取到的 OAuth Token

### `extract` - 数据提取

用于从变量中提取复杂结构数据。

- `args`:
  - `source`: string (源变量，支持 `{var}`)
  - `type`: "jsonpath" | "key"
  - `expr`: string (表达式)
- `outputs`: 提取结果保存到变量

### `curl` - cURL 请求解析

用于从用户粘贴的 cURL 命令中提取请求头信息。

- `secrets`:
  - `curl_command`: string (保存的密钥名称ID)
- `args`:
  - `label`: string (前端显示的标签)
  - `description`: string (可选，前端显示的描述信息)
  - `message`: string (可选，弹窗提示标题)
  - `warning_message`: string (可选，警告信息)
- `outputs`:
  - 指定提取的请求头（如 `authorization`）
  - `headers`: 包含所有提取到的请求头字典
  - `curl_command`: 原始 cURL 字符串

### `webview` - 后台 WebView 爬取

使用隐式 WebView 加载页面执行注入的 JavaScript 获取数据。

- `secrets`:
  - `webview_data`: string (保存的截获数据对象名称)
- `args`:
  - `url`: string (必填，目标 URL)
  - `intercept_api`: string (要拦截的 API 请求匹配字符串)
  - `script`: string (注入到页面的环境脚本，可为空)
- `outputs`:
  - 从 `webview_data` JSON 数据中提取任意字段

### `script` - 自定义 Python 执行

在 Flow 中安全执行自定义 Python 代码处理已有的输出或者进行计算。

- `args`:
  - `code`: string (必填，包裹在 Flow 执行环境中的 Python 代码)
- `outputs`:
  - 提取在脚本中定义的局部变量字典

### `log` - 打印日志

用于调试流程。

- `args`:
  - `message`: string (支持 `{var}` 变量替换)

---

## 五、数据源管理 (Sources)

**注意**：数据源配置已从 YAML 迁移到 JSON 存储，通过 API 管理。

### 存储位置
- 文件：`data/sources.json`
- API：`GET/POST /api/sources`, `PUT/DELETE /api/sources/{id}`

### 数据结构

```json
{
  "id": "my_source",
  "integration_id": "openrouter_keys_apikey",
  "name": "My OpenRouter Integration",
  "config": {
    "api_key": "sk-or-xxx"
  },
  "vars": {
    "param1": "value1"
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符 |
| `integration_id` | string | 引用的 Integration ID |
| `name` | string | 显示名称 |
| `config` | object | 认证配置和特定设置 |
| `vars` | object | 模板变量 |

---

## 六、视图管理 (Views)

**注意**：视图配置已从 YAML 迁移到 JSON 存储，通过 API 管理。

### 存储位置
- 文件：`data/views.json`
- API：`GET/POST /api/views`, `PUT/DELETE /api/views/{id}`

### 数据结构

```json
{
  "id": "main_view",
  "name": "Main Dashboard",
  "layout_columns": 12,
  "items": [
    {
      "id": "widget_1",
      "w": 4,
      "source_id": "my_source",
      "template_id": "metric_usage",
      "props": {
        "label": "Custom Label"
      }
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符 |
| `name` | string | 视图名称 |
| `layout_columns` | int | 网格列数（默认 12，支持 24） |
| `items` | array | 视图项列表 |

### ViewItem 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符 |
| `x` | int | 网格列位置（默认 0） |
| `y` | int | 网格行位置（默认 0） |
| `w` | int | 宽度（列数） |
| `h` | int | 高度（行数，默认 2） |
| `source_id` | string | 关联的数据源 ID |
| `template_id` | string | 关联的 Integration 模板 ID |
| `props` | object | 模板属性覆盖 |

---

## 七、组件组 (`component_groups`) [Legacy]

> **注意**：此功能已逐步被 Integration Templates 取代。建议在新配置中使用 `templates` 字段。

---

## 八、快速集成清单

要接入一个新的第三方平台，按以下步骤操作：

1. **术语核对**：根据 [docs/terminology.md](docs/terminology.md) 确定数据类型 (Metric/Signal)。
2. **确认鉴权方式**：API Key? OAuth?
3. **找到目标 API**：确定 URL、方法、需要的参数。
4. **编写 Flow 步骤**：在 `integrations` YAML 中定义 flow 编排。
5. **定义视图模板**：在 `integrations` YAML 中使用 `templates` (推荐使用 `progress_bar` 代替 `quota_bar`)。
6. **创建数据源**：调用 `POST /api/sources` 创建 JSON 配置。
7. **创建视图**：调用 `POST /api/views` 创建视图布局。
8. **重启后端**：启动 FastAPI 服务，观察日志确认采集成功。
