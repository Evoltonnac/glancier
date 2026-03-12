# Glancier Flow 架构与编排总览

## 1. 目标

Flow 是集成执行流水线，负责：
- 鉴权与凭据恢复（API Key / OAuth / cURL / WebView）
- 数据拉取与解析（HTTP / Extract / Script）
- 交互阻塞与恢复执行（NeedsInteraction -> 用户完成 -> resume）

## 2. Step 通用结构

每个 `flow` 节点均支持：
- `id`（必填）：步骤唯一标识。
- `use`（必填）：步骤类型。
- `args`：步骤参数（支持模板插值）。
- `outputs`：将结果字段映射为 Flow 变量。
- `secrets`：声明需要持久化保存的敏感数据映射。

示例：

```yaml
- id: fetch_profile
  use: http
  args:
    method: GET
    url: "https://api.example.com/me"
    headers:
      Authorization: "Bearer {access_token}"
  outputs:
    http_response: "profile"
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
