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
  - source `error_code` becomes `runtime.retry_required` (or `runtime.network_timeout` for timeout-class uncertainty)
  - refresh scheduler retries with bounded backoff (`60s`, `180s`, `600s`)
  - retry cap is `3` attempts before terminal failure handling
  - status churn (`error` <-> `suspended`) does not restart retry budget for the same runtime signature
  - `updated_at` mutations alone do not reset the backoff window

### 5.1 Churn Regression Notes

- Reproduce loop-risk path by updating source status and `updated_at` between retries.
- Confirm second retry still waits for the `180s` window from first enqueue.
- Confirm third retry still waits for the `600s` window from second enqueue.
- Confirm no fourth automatic retry is enqueued without success/signature reset.

WebView runtime details: [../webview-scraper/02_runtime_and_fallback.md](../webview-scraper/02_runtime_and_fallback.md)
Refresh scheduler retry architecture: [05_refresh_scheduler_and_retry.md](05_refresh_scheduler_and_retry.md)

## 6. `test_fail_step_sql.yaml`

- Goal: validate deterministic SQL contract/runtime/trust failures for `use: sql`
- Input baseline:
  - connector profile + credentials reference
  - user-authored SQL query text
  - optional `timeout` / `max_rows` overrides
- Expected SQL failure classes and `error_code` contracts:
  - invalid SQL contract or parse failure: `runtime.sql_invalid_contract`
  - high-risk SQL trust prompt path: `runtime.sql_risk_operation_requires_trust`
  - high-risk SQL denied by trust policy: `runtime.sql_risk_operation_denied`
  - SQL connect failure: `runtime.sql_connect_failed`
  - SQL authentication failure: `runtime.sql_auth_failed`
  - SQL query execution failure: `runtime.sql_query_failed`
  - SQL timeout guardrail hit: `runtime.sql_timeout`
  - SQL row-limit guardrail hit: `runtime.sql_row_limit_exceeded`

### 6.1 SQL Failure Input Matrix

| Case | Minimal Input Pattern | Expected Result |
| --- | --- | --- |
| Invalid contract | `query: ""` or parse-invalid SQL text | source status `error`, `error_code=runtime.sql_invalid_contract` |
| Trust required | risk-class SQL (for example `DELETE`) with no allow decision | source status `suspended`, interaction `confirm`, `error_code=runtime.sql_risk_operation_requires_trust` |
| Trust denied | risk-class SQL with deny decision | source status `error`, `error_code=runtime.sql_risk_operation_denied` |
| Connect failure | bad DSN/path/host | source status `error`, `error_code=runtime.sql_connect_failed` |
| Auth failure | invalid credential payload | source status `error`, `error_code=runtime.sql_auth_failed` |
| Query failure | syntactically valid but runtime-invalid query | source status `error`, `error_code=runtime.sql_query_failed` |
| Timeout | low timeout against slow query | source status `error`, `error_code=runtime.sql_timeout` |
| Row-limit exceeded | `max_rows` lower than result cardinality | source status `error`, `error_code=runtime.sql_row_limit_exceeded` |

### 6.2 Guardrail Precedence Reminder (SQL)

For timeout and row-limit deterministic tests, resolve expected thresholds in this order:
1. source override (`args.timeout` / `args.max_rows`, including source-variable substitution)
2. system settings defaults (`sql_default_timeout_seconds`, `sql_default_max_rows`)
3. SQL runtime built-ins (`30s`, `500 rows`)
