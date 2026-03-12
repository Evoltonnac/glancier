# Glancier Flow 架构与编排总览

## 1. 目标

Flow 是集成执行流水线，负责：
- 鉴权与凭据恢复（API Key / OAuth / cURL / WebView）
- 数据拉取与解析（HTTP / Extract / Script）
- 交互阻塞与恢复执行（NeedsInteraction -> 用户完成 -> resume）

## 2. Step 通用结构

每个 `flow` 节点均支持以下输出处理方式，它们都能使变量在后续 Step 中通过 `{var}` 引用，但持久化行为不同：

| 字段 | 持久化方式 | 安全性 | 主要用途 |
| --- | --- | --- | --- |
| `outputs` | **持久化到 Data Store** | 公开（用于展示） | 最终展示给用户的数据（如余额、进度、文本）。 |
| `secrets` | **持久化到 Secret Store** | 加密（受保护） | 敏感凭据（如 API Key, OAuth Token, Session）。 |
| `context` | **仅保留在内存** | 临时（不落盘） | 流程中间变量（如临时 ID、仅供后续步骤使用的参数）。 |

其中 `outputs` / `context` / `secrets` 的映射格式统一为：`目标变量: 来源路径`。

示例：

```yaml
- id: fetch_api
  use: http
  args:
    url: "https://api.example.com/data"
  outputs:
    display_value: "result.value"     # 存储到 data.json，SDUI 可用
  secrets:
    new_token: "headers.X-New-Token"  # 存储到 secrets.json，加密保存
  context:
    temp_id: "result.id"              # 仅内存有效，供下个 Step 使用
```

## 3. 变量解析优先级

`args` 中 `{var}` 的解析顺序：
1. 上一步骤 `outputs`（短作用域）
2. Flow 上下文变量
3. Secrets 持久化存储

## 4. 阻塞执行模型

当步骤依赖用户交互且上下文无可用凭据时，Flow 会进入 suspend：
1. Python 侧标记 `NeedsInteraction`
2. UI 展示对应输入或授权动作
3. 用户完成后提交交互结果
4. Flow 从中断点恢复并继续

这套机制适用于 `api_key` / `oauth` / `curl` / `webview`。

## 5. 与 SDUI 和 WebView 的关系

- Flow 产生数据与状态；SDUI 负责展示：见 [../sdui/README.md](../sdui/README.md)
- `webview` 步骤底层能力由 Scraper 模块提供：见 [../webview-scraper/README.md](../webview-scraper/README.md)
