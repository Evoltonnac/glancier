# Glanceus Flow Step Reference

This document is the step-level contract for integration `flow` authoring.
For channel persistence and variable resolution rules, see [01_architecture_and_orchestration.md](./01_architecture_and_orchestration.md).

## 1. Universal Step Contract

Each step supports the same envelope:

```yaml
- id: "required_step_id"
  use: "required_step_type"
  run: "optional_reserved_field"
  args: {}
  outputs: {}
  context: {}
  secrets: {}
```

Field semantics:

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | `string` | Unique step identifier in the flow. |
| `use` | Yes | `StepType` | One of: `http`, `oauth`, `api_key`, `form`, `curl`, `extract`, `script`, `log`, `webview`. |
| `run` | No | `string \| null` | Reserved field (not currently used by executor logic). |
| `args` | No | `object` | Step-specific input arguments after `{var}` substitution. |
| `outputs` | No | `map<string,string>` | Persist/display mappings (`target: source_path`). |
| `context` | No | `map<string,string>` | In-memory mappings for downstream steps (`target: source_path`). |
| `secrets` | No | `map<string,string>` | Encrypted secret mappings (`secret_name: source_path`). |

Channel usage rules:

- For non-blocking steps (`http`, `extract`, `script`, `log`), default intermediate artifacts to `context`; use `outputs` only when persistence is required.
- Avoid mapping unfiltered large payloads directly into `outputs`; extract/clean first and persist only minimal durable/display fields.

Output path formats accepted in `outputs` / `context` / `secrets`:

1. Direct key: `http_response`
2. Dotted path: `headers.Authorization`
3. JSONPath: `$.data[0].id`

## 2. Blocking vs Non-Blocking Steps

Blocking (can suspend flow and request interaction):

1. `api_key`
2. `form`
3. `oauth`
4. `curl`
5. `webview`

Non-blocking runtime steps:

1. `http`
2. `extract`
3. `script`
4. `log` (schema-defined; see status note below)

## 3. Step Catalog

### `api_key`

Purpose:
- Collect one credential value intended for API authentication.

Common `args`:
- `label`
- `description`
- `message`

Runtime output envelope:
- `api_key`

Typical mapping:

```yaml
- id: collect_key
  use: api_key
  args:
    label: "API Key"
  secrets:
    api_key: "api_key"
```

### `form`

Purpose:
- Collect one or multiple generic user-provided values.

Supported `args`:
- Multi-field mode: `fields` (list of objects with `key` required, plus `label`, `type`, `description`, `placeholder`, `required`, `default`)
- Single-field shorthand: `key`, `label`, `type`, `description`, `required`, `default`
- Optional defaults map: `defaults`
- Interaction text: `message`, `warning_message`

Runtime output envelope:
- Returns resolved values keyed by each field's logical `key`

Typical mapping:

```yaml
- id: collect_region
  use: form
  args:
    key: "region"
    label: "Region"
    default: "us-east-1"
  context:
    region: "region"
```

### `oauth`

Purpose:
- Start OAuth authorization when token is missing, then expose token bundle for downstream steps.

Core `args` (commonly used):
- `oauth_flow` (`code`, `device`, `client_credentials`)
- `auth_url`
- `token_url`
- `client_id`
- `client_secret`
- `scopes` or `scope`
- `redirect_uri`
- `doc_url`

Advanced provider-compatibility `args` are also supported (token field names, device polling fields, token endpoint auth method, PKCE flags). See schema in [core/config_loader.py](/Users/xingminghua/Coding/evoltonnac/glanceus/core/config_loader.py).

Runtime output envelope:
- `oauth_secrets` (dictionary; includes `access_token` and optional refresh/expiry metadata)

Typical mapping:

```yaml
- id: oauth_login
  use: oauth
  args:
    oauth_flow: "device"
    device_authorization_url: "https://provider.example.com/oauth/device/code"
    token_url: "https://provider.example.com/oauth/token"
  secrets:
    oauth_secrets: "oauth_secrets"
```

OAuth details: [03_step_oauth.md](./03_step_oauth.md)

### `curl`

Purpose:
- Ask user to paste a browser-captured cURL command and extract headers from it.

Common `args`:
- `label`
- `description`
- `message`
- `warning_message`

Runtime output envelope:
- `curl_command`
- `headers` (dictionary parsed from `-H/--header`)
- Flattened header aliases (for example `Authorization`)

Typical mapping:

```yaml
- id: capture_session
  use: curl
  args:
    label: "Browser cURL"
  secrets:
    curl_command: "curl_command"
  context:
    auth_header: "headers.Authorization"
```

### `webview`

Purpose:
- Trigger desktop scraper flow when direct API auth is not available; capture targeted response payload.

Supported `args`:
- Required: `url`
- Optional: `script`, `intercept_api`

Runtime output envelope:
- `webview_data`
- If `webview_data` is an object, each top-level key is also exposed as a flattened output key.

Typical mapping:

```yaml
- id: webview_fetch
  use: webview
  args:
    url: "https://console.example.com/"
    intercept_api: "/dashboard"
  context:
    dashboard_payload: "webview_data"
```

Runtime details: [../webview-scraper/01_architecture_and_dataflow.md](../webview-scraper/01_architecture_and_dataflow.md)

### `http`

Purpose:
- Execute HTTP request and provide both parsed JSON and raw payload.

Supported `args`:
- Required: `url`
- Optional: `method` (default `GET`), `headers`, `timeout` (default `30`), `retries` (default `2`), `retry_backoff_seconds` (default `0.5`)

Runtime output envelope:
- `http_response` (parsed JSON, or `null` if response is not JSON)
- `raw_data` (raw response text)
- `headers` (response headers)

Typical mapping:

```yaml
- id: fetch_usage
  use: http
  args:
    url: "https://api.example.com/v1/usage"
    headers:
      Authorization: "Bearer {oauth_secrets.access_token}"
  context:
    usage_payload: "http_response"
```

### `extract`

Purpose:
- Project fields from structured source data by key lookup or JSONPath.

Supported `args`:
- Required: `source`
- Optional: `type` (`jsonpath` default, or `key`)

Runtime behavior:
- `outputs` defines extraction expressions (`target: expression`).
- Extracted values are returned only when an expression resolves successfully.

Typical mapping:

```yaml
- id: parse_usage
  use: extract
  args:
    source: "{usage_payload}"
    type: "jsonpath"
  outputs:
    metric_value: "$.usage.current"
    metric_limit: "$.usage.limit"
```

### `script`

Purpose:
- Run deterministic Python transformation over current flow variables.

Supported `args`:
- Required: `code`

Runtime behavior:
- Script local environment is seeded by merged `context` and mapped previous-step values.
- Only variables referenced by `outputs` and `context` mappings are emitted.
- `print()` and stderr streams are captured into runtime logs.
- Script runtime enforces `script_timeout_seconds` from system settings (default `10` seconds) and fails with `script_timeout_exceeded` when exceeded.
- Optional lightweight sandbox mode (`script_sandbox_enabled`, **Beta**) is disabled by default for compatibility; when enabled it blocks high-risk builtins/imports and fails with `script_sandbox_blocked`.
- Sandbox mode intentionally favors compatibility over full isolation; integrations that need blocked capabilities should keep sandbox disabled.
- Integrations and UI surfaces should preserve deterministic error-code exposure for these failures (avoid generic-only fallback text).

Typical mapping:

```yaml
- id: derive_signal
  use: script
  args:
    code: |
      ratio = (metric_value / metric_limit) if metric_limit else 0
      signal = "danger" if ratio >= 0.9 else "ok"
  outputs:
    usage_ratio: "ratio"
    usage_signal: "signal"
```

### `log`

Purpose:
- Reserved schema step for explicit logging intent.

Supported `args`:
- `message`

Current runtime status:
- Declared in schema, but no dedicated executor branch is wired yet.
- Do not rely on `log` for production flow behavior; use `script` with `print()` if runtime traces are required.

## 4. Adding a New Step Type

1. Add `StepType` entry in [core/config_loader.py](/Users/xingminghua/Coding/evoltonnac/glanceus/core/config_loader.py).
2. Add corresponding schema in `STEP_ARGS_SCHEMAS_BY_USE` (same file).
3. Wire executor handling in [core/executor.py](/Users/xingminghua/Coding/evoltonnac/glanceus/core/executor.py) and, if needed, a new module under `core/steps/`.
4. Run `make gen-schemas` to regenerate `config/schemas/integration.python.schema.json` and `config/schemas/integration.schema.json`.
5. Add or update regression tests for the new behavior.
