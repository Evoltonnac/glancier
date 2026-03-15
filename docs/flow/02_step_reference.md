# Glancier Flow Step Reference

Architecture background: [01_architecture_and_orchestration.md](./01_architecture_and_orchestration.md)

## 1. Auth and Blocking Steps

### `api_key`
- Purpose: ask the user for API key/token input.
- Common `args`: `label`, `description`
- Common `secrets`: `api_key`

### `oauth`
- Purpose: run OAuth and persist tokens.
- Typical output: `access_token` (optionally refresh/expiry fields)
- See details: [03_step_oauth.md](./03_step_oauth.md)

### `curl`
- Purpose: ask the user to paste a browser-captured cURL command.
- Common `secrets`: `curl_command`

### `webview`
- Purpose: open a background page in desktop runtime and intercept target API responses.
- Common `args`: `url`, `intercept_api`
- Common `secrets`: `webview_data`
- Runtime details: [../webview-scraper/01_architecture_and_dataflow.md](../webview-scraper/01_architecture_and_dataflow.md)

## 2. Data Processing Steps

### Output Mapping Format
- `outputs` uses the unified format: `target_var: source_path`
- Supported source paths:
  - direct key (for example `http_response`)
  - dotted path (for example `headers.Authorization`)
  - JSONPath (for example `$.data[0].id`)

### `http`
- Purpose: execute a standard HTTP request.
- Typical outputs: `http_response`, `raw_data`, `headers`

### `extract`
- Purpose: extract fields from structured data.
- Common `args`: `source`, `type` (`jsonpath` / `key`)
- Multi-output supported via multiple mappings in `outputs`

### `script`
- Purpose: run lightweight script-based transformation (subject to runtime policy)

## 3. Example (WebView + Extract)

```yaml
flow:
  - id: webview_fetch
    use: webview
    args:
      url: "https://console.soniox.com/"
      intercept_api: "/dashboard/"
    outputs:
      dashboard_response: "webview_data"

  - id: parse_balance
    use: extract
    args:
      source: "{dashboard_response}"
      type: "jsonpath"
    outputs:
      available_balance: "$.billing.available_balance_usd"
      currency: "$.billing.currency"
```

## 4. Failure Replay Inputs

See [04_step_failure_test_inputs.md](./04_step_failure_test_inputs.md)
