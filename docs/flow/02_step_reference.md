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
| `use` | Yes | `StepType` | One of: `http`, `oauth`, `api_key`, `form`, `curl`, `extract`, `script`, `sql`, `mongodb`, `redis`, `log`, `webview`. |
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
6. `sql` (only for high-risk SQL operations when trust decision is `prompt`)

Non-blocking runtime steps:

1. `http`
2. `extract`
3. `script`
4. `sql` (normal query path when trust check is already resolved)
5. `mongodb`
6. `redis`
7. `log` (schema-defined; see status note below)

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
- Optional: `method` (default `GET`), `headers`, `timeout` (default `30`), `retries` (default `2`), `retry_backoff_seconds` (default `0.5`), `follow_redirects` (default `false`)

Runtime output envelope:
- `http_response` (parsed JSON, or `null` if response is not JSON)
- `raw_data` (raw response text)
- `headers` (response headers)

Runtime trust-gate behavior:
- URL scheme must be `http` or `https`; invalid target emits `runtime.network_target_invalid`.
- Public targets continue as normal.
- Private/loopback targets are evaluated by trust policy:
  - No matching trust decision -> suspend with interaction (`confirm`) and `runtime.network_trust_required`.
  - Explicit deny -> fail with `runtime.network_target_denied`.
  - Allow (persisted or one-time) -> request proceeds.

Trust interaction submit contract (`/api/sources/{source_id}/interact`):

```json
{
  "type": "confirm",
  "decision": "allow_once | allow_always | deny",
  "scope": "source | global",
  "target_key": "<normalized-host-or-host_port>"
}
```

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
- Sandbox allowlist includes common deterministic stdlib modules for parsing/time/data transforms (for example: `re`, `datetime`, `time`, `calendar`, `csv`, `json`, `uuid`, `hashlib`, `collections`, `math`).
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

### `sql`

Purpose:
- Execute a SQL query through the backend-owned connector runtime and return deterministic query output envelopes.

Required `args`:
- `connector.profile`
- connection string: `dsn` or `uri` (secret-backed)
- `query`

Optional `args`:
- `connector.options.dialect` (used for SQLGlot parser dialect hints)
- `timeout` (seconds)
- `max_rows`

Runtime contract:
- Final SQL text is classified with SQLGlot AST before execution.
- Connector profile runtime support (current): `sqlite`, `postgresql`, `mysql`.
- High-risk or non-query statements require trust policy evaluation (`capability=sql`):
  - no trust decision -> suspend with `runtime.sql_risk_operation_requires_trust`
  - explicit deny -> fail with `runtime.sql_risk_operation_denied`
  - allow -> execute
- For timeout and row-limit guardrails, precedence is:
  1. source override (resolved `args.timeout` / `args.max_rows`, including source-variable substitution)
  2. system defaults (`sql_default_timeout_seconds`, `sql_default_max_rows`)
  3. step built-ins (`30s`, `500 rows`)
- Deterministic runtime SQL failure codes:
  - `runtime.sql_invalid_contract`
  - `runtime.sql_connect_failed`
  - `runtime.sql_auth_failed`
  - `runtime.sql_query_failed`
  - `runtime.sql_timeout`
- `max_rows` is a response-shaping guardrail: over-limit rows are truncated into a successful response (`sql_response.truncated=true`) instead of raising a runtime failure.

Runtime output envelope:
- Canonical keys:
  - `sql_response.rows`
  - `sql_response.fields`
  - `sql_response.row_count`
  - `sql_response.duration_ms`
  - `sql_response.truncated`
  - `sql_response.statement_count`
  - `sql_response.statement_types`
  - `sql_response.is_high_risk`
  - `sql_response.risk_reasons`
  - `sql_response.timeout_seconds`
  - `sql_response.max_rows`
- Compatibility aliases:
  - `sql_response.columns` (derived from `sql_response.fields[*].name`)
  - `sql_response.execution_ms` (alias of `sql_response.duration_ms`)

Typical mapping:

```yaml
- id: query_usage
  use: sql
  args:
    connector:
      profile: sqlite
      options:
        dialect: sqlite
    dsn: "{sqlite_dsn_or_path}"
    query: "SELECT value FROM metrics ORDER BY id"
    timeout: "{sql_timeout_override}"
    max_rows: "{sql_max_rows_override}"
  outputs:
    sql_rows: "sql_response.rows"
```

### `mongodb`

Purpose:
- Execute read-only MongoDB operations through backend runtime (`find` / `aggregate`) and return deterministic document envelopes.

Required `args`:
- connection string: `uri` or `dsn` (secret-backed)
- `database`
- `collection`
- `operation` (`find` or `aggregate`)

Optional `args`:
- `connector.profile` (when provided, must be `mongodb`)
- `filter`, `projection`, `sort` (for `operation=find`)
- `pipeline` (for `operation=aggregate`)
- `timeout` (seconds)
- `max_rows`

Deterministic runtime MongoDB failure codes:
- `runtime.mongo_invalid_contract`
- `runtime.mongo_connect_failed`
- `runtime.mongo_auth_failed`
- `runtime.mongo_query_failed`
- `runtime.mongo_timeout`

Runtime output envelope:
- `mongo_response.rows`
- `mongo_response.fields`
- `mongo_response.row_count`
- `mongo_response.duration_ms`
- `mongo_response.truncated`
- `mongo_response.operation`
- `mongo_response.timeout_seconds`
- `mongo_response.max_rows`

### `redis`

Purpose:
- Execute read-only Redis commands through backend runtime and return deterministic row envelopes.

Required `args`:
- connection string: `uri` or `dsn` (secret-backed)
- `command` (currently: `get`, `mget`, `hgetall`, `lrange`, `zrange`, `smembers`)

Optional `args`:
- `connector.profile` (when provided, must be `redis`)
- `key`, `keys`, `start`, `stop`, `withscores` (command-specific parameters; `withscores` applies to `zrange`, default `true`)
- `timeout` (seconds)
- `max_rows`

Deterministic runtime Redis failure codes:
- `runtime.redis_invalid_contract`
- `runtime.redis_connect_failed`
- `runtime.redis_auth_failed`
- `runtime.redis_query_failed`
- `runtime.redis_timeout`

Runtime output envelope:
- `redis_response.rows`
- `redis_response.fields`
- `redis_response.row_count`
- `redis_response.duration_ms`
- `redis_response.truncated`
- `redis_response.command`
- `redis_response.timeout_seconds`
- `redis_response.max_rows`

### `log`

Purpose:
- Reserved schema step for explicit logging intent.

Supported `args`:
- `message`

Current runtime status:
- Declared in schema, but no dedicated executor branch is wired yet.
- Do not rely on `log` for production flow behavior; use `script` with `print()` if runtime traces are required.

## 4. Database Metadata Normalization

For database step types (`sql`, `mongodb`, `redis`), the `response.fields` metadata is normalized into a canonical Glanceus format to ensure consistent chart rendering regardless of the underlying database engine.

### 4.1 Canonical Field Types

| Canonical Type | Description | Typical Source Types |
| --- | --- | --- |
| `integer` | Whole numbers | `int`, `bigint`, `int4`, `int8`, `short`, `long` |
| `float` | Floating point numbers | `float`, `double`, `real`, `float8` |
| `decimal` | Exact numeric values | `decimal`, `numeric`, `money` |
| `string` | Text strings | `varchar`, `text`, `char`, `uuid`, `json` |
| `boolean` | Logical values | `bool`, `boolean`, `tinyint(1)` |
| `date` | Date without time | `date`, `year` |
| `time` | Time without date | `time`, `timetz` |
| `datetime` | Date and time | `timestamp`, `datetime`, `timestamptz` |
| `bytes` | Binary data | `blob`, `bytea`, `binary`, `varbinary` |
| `unknown` | Undetected or complex type | Default fallback when no mapping or data exists |

### 4.2 Normalization vs Inference

The system uses a two-tier strategy to determine field types:

1.  **Driver Mapping (Tier 1)**: The system first checks the type metadata reported by the database driver (e.g., `psycopg`, `pymysql`, `sqlite3`). If the driver returns a known type alias (including common internal names like PostgreSQL's `int4` or `float8`), it is mapped to a canonical type.
2.  **Automatic Inference (Tier 2)**: If the driver reports an unknown type alias or explicitly marks it as `unknown`, the system falls back to automatic inference. It scans the actual data rows in the result set and identifies the Python equivalent types (`int`, `float`, `Decimal`, `datetime`, etc.) to resolve a canonical type.

### 4.3 SDUI Integration

When authoring templates, using `fields_source: "{sql_response.fields}"` ensures that widgets like `Chart.Table` can automatically select the correct column alignment, numeric formatting, and sorting behavior based on these canonical types.

## 5. Adding a New Step Type

1. Add `StepType` entry in [core/config_loader.py](/Users/xingminghua/Coding/evoltonnac/glanceus/core/config_loader.py).
2. Add corresponding schema in `STEP_ARGS_SCHEMAS_BY_USE` (same file).
3. Wire executor handling in [core/executor.py](/Users/xingminghua/Coding/evoltonnac/glanceus/core/executor.py) and, if needed, a new module under `core/steps/`.
4. Run `make gen-schemas` to regenerate `config/schemas/integration.python.schema.json` and `config/schemas/integration.schema.json`.
5. Add or update regression tests for the new behavior.
