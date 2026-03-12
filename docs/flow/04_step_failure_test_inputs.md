# Step 失败测试输入样例

这些样例用于快速回归“鉴权失败后可恢复”的关键路径。OAuth 细节见 [03_step_oauth.md](./03_step_oauth.md)。

## 1. `test_fail_step_api_key.yaml`

- 目的：验证 `api_key` 无效凭据路径（`ERROR` + `input_text` 重试）。
- 输入：`test_api_key: sk-test-invalid`
- 期望：
  - `fetch_unauthorized` 返回 401
  - source 状态为 `error`
  - interaction 为 `input_text`

## 2. `test_fail_step_oauth.yaml`

- 目的：验证 `oauth` 缺失/无效凭据处理。
- 输入：
  - 首次交互：`client_id` / `client_secret` 无效值
  - 可选直接失败种子：`access_token: test-token-invalid`
- 期望：
  - token 存在时 `fetch_unauthorized` 返回 401
  - source 状态为 `error`
  - interaction 为 `oauth_start`

## 3. `test_fail_step_curl.yaml`

- 目的：验证 `curl` 会话失效路径（`ERROR` + cURL 重录入）。
- 输入：`test_curl_command: curl 'https://example.com' -H 'Authorization: Bearer invalid-token'`
- 期望：
  - `fetch_unauthorized` 返回 401
  - source 状态为 `error`
  - interaction 为 `input_text`

## 4. `test_fail_step_webview.yaml`

- 目的：验证 WebView 抓取阻塞恢复（`SUSPENDED` + `webview_scrape`）。
- 输入：`test_webview_data: {"session":"invalid","note":"failure-test"}`
- 期望：
  - `fetch_blocked` 返回 403
  - source 状态为 `suspended`
  - interaction 为 `webview_scrape`
  - 交互数据含 `force_foreground=true`、`manual_only=true`

WebView 运行时详见 [../webview-scraper/02_runtime_and_fallback.md](../webview-scraper/02_runtime_and_fallback.md)。
