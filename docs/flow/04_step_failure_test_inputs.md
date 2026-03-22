# Step Failure Test Input Examples

These inputs are for fast regression on recoverability after auth failures.

## 1. `test_fail_step_api_key.yaml`

- Goal: validate invalid-credential handling for `api_key` (`ERROR` + `input_text` retry)
- Input: `test_api_key: sk-test-invalid`
- Expected:
  - `fetch_unauthorized` returns 401
  - source status becomes `error`
  - interaction type is `input_text`

## 2. `test_fail_step_oauth.yaml`

- Goal: validate missing/invalid credential handling for `oauth`
- Input:
  - initial interaction with invalid `client_id` / `client_secret`
  - optional direct-failure seed: `oauth_secrets: {"access_token":"test-token-invalid"}`
- Expected:
  - when token exists, `fetch_unauthorized` returns 401
  - source status becomes `error`
  - interaction type is `oauth_start`

## 3. `test_fail_step_curl.yaml`

- Goal: validate expired session handling for `curl` (`ERROR` + cURL re-entry)
- Input: `test_curl_command: curl 'https://example.com' -H 'Authorization: Bearer invalid-token'`
- Expected:
  - `fetch_unauthorized` returns 401
  - source status becomes `error`
  - interaction type is `input_text`

## 4. `test_fail_step_webview.yaml`

- Goal: validate blocked WebView recovery (`SUSPENDED` + `webview_scrape`)
- Input: `test_webview_data: {"session":"invalid","note":"failure-test"}`
- Expected:
  - `fetch_blocked` returns 403
  - source status becomes `suspended`
  - interaction type is `webview_scrape`
  - interaction payload includes `manual_only=true`
  - interaction payload does not require `force_foreground=true` default

## 5. `test_fail_step_webview_uncertain.yaml`

- Goal: validate uncertain WebView runtime failure retries (`ERROR` + retry budget)
- Input: `test_webview_data: {"mode":"uncertain","note":"retry-test"}`
- Expected:
  - source `error_code` becomes `runtime.retry_required`
  - refresh scheduler retries with bounded backoff (`60s`, `180s`, `600s`)
  - retry cap is `3` attempts before terminal failure handling

WebView runtime details: [../webview-scraper/02_runtime_and_fallback.md](../webview-scraper/02_runtime_and_fallback.md)
