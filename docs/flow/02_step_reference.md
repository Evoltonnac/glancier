# Glancier Flow Step 参考

架构背景见 [01_architecture_and_orchestration.md](./01_architecture_and_orchestration.md)。

## 1. 鉴权/阻塞类步骤

### `api_key`
- 用途：请求用户输入 API Key 或 Token。
- 常见 `args`：`label`、`description`。
- 常见 `secrets`：`api_key`。

### `oauth`
- 用途：执行 OAuth 授权流程并写回 token。
- 输出：`access_token`（可扩展 refresh/expiry）。
- 专项说明见 [03_step_oauth.md](./03_step_oauth.md)。

### `curl`
- 用途：提示用户粘贴浏览器抓包 cURL 指令。
- 常见 `secrets`：`curl_command`。

### `webview`
- 用途：在桌面端后台打开页面并截取目标接口响应。
- 常见 `args`：`url`、`intercept_api`。
- 常见 `secrets`：`webview_data`。
- 运行细节见 [../webview-scraper/01_architecture_and_dataflow.md](../webview-scraper/01_architecture_and_dataflow.md)。

## 2. 数据处理类步骤

### `http`
- 用途：标准 HTTP 请求。
- 典型输出：`http_response`、`raw_data`、`headers`。

### `extract`
- 用途：从结构化数据中提取字段。
- 常见 `args`：`source`、`type`（`jsonpath`/`key`）、`expr`。

### `script`
- 用途：执行轻量脚本转换数据（受运行时策略约束）。

## 3. 示例（WebView + Extract）

```yaml
flow:
  - id: webview_fetch
    use: webview
    args:
      url: "https://console.soniox.com/"
      intercept_api: "/dashboard/"
    outputs:
      dashboard_response: "dashboard_response"

  - id: parse_balance
    use: extract
    args:
      source: "{dashboard_response}"
      type: "jsonpath"
      expr: "$.billing.available_balance_usd"
    outputs:
      available_balance: "available_balance"
```

## 4. 失败回放样例

见 [04_step_failure_test_inputs.md](./04_step_failure_test_inputs.md)。
