# Glanceus Flow Patterns

Integration YAML authoring reference. Use `config/schemas/integration.schema.json` as source of truth.
Detailed runtime step behavior is documented in `docs/flow/02_step_reference.md`.

## Top-Level

`config/integrations/*.yaml` fields: `name`, `description`, `default_refresh_interval_minutes`, `flow`, `templates`. Runtime `id` from filename, not inline.

Refresh interval authoring rules:
- Do not set `default_refresh_interval_minutes: 0` only because the flow contains `webview`.
- Prefer a positive interval (for example `30` or `60`) when WebView is mainly for first-time login and downstream requests can keep/refresh session or token state.
- Use `0` only when refresh usually requires fresh manual interaction on most runs (for example repeated captcha/login walls), or when the user explicitly asks for manual-only refresh.

## Step Contract

Required: `id`, `use`. Optional: `args`, `outputs`, `context`, `secrets`, `run`.

Current `use`: `http`, `oauth`, `api_key`, `form`, `curl`, `extract`, `script`, `sql`, `mongodb`, `redis`, `log`, `webview`.

## Output Channels

- `secrets`: persistent + encrypted (credentials, tokens)
- `outputs`: persistent + plaintext (UI data)
- `context`: in-memory only (intermediates)
- For non-blocking steps (`http`, `extract`, `script`, `log`), default intermediate artifacts to `context`.
- Avoid persisting unfiltered large payloads in `outputs`; persist cleaned/minimal fields instead.

## Variable Resolution

`{var}` resolves: runtime context → secrets → outputs.

## Blocking Steps

`api_key`, `form`, `oauth`, `curl`, `webview`, and high-risk `sql` suspend execution. Keep pre-steps idempotent. Persist resume-critical values.

---

# Step Reference

## `api_key`
- Purpose: collect one credential value (API key/token).
- Common args: `label`, `description`, `message`.
- Runtime output envelope: `api_key`.
- Typical mapping: `secrets: { api_key: "api_key" }`.

## `form`
- Purpose: collect generic user inputs (single or multi-field).
- Common args:
  - single-field shorthand: `key`, `label`, `type`, `description`, `required`, `default`
  - multi-field mode: `fields` (list; each item supports `key`, `label`, `type`, `description`, `placeholder`, `required`, `default`)
  - extras: `defaults`, `message`, `warning_message`
- Runtime output envelope: one key/value per collected field.
- Typical mapping: route each field via `context`, `outputs`, or `secrets` depending on persistence/security needs.

## `oauth`
- Purpose: run OAuth interaction and expose token bundle for downstream requests.
- Core args: `oauth_flow`, `auth_url`, `token_url`, `client_id`, `client_secret`, `scope/scopes`, `redirect_uri`, `doc_url`.
- Runtime output envelope: `oauth_secrets` dictionary.
- Typical mapping: `secrets: { oauth_secrets: "oauth_secrets" }`.
- Downstream usage: `{oauth_secrets.access_token}`.

## `curl`
- Purpose: collect user-pasted browser cURL and parse request headers.
- Common args: `label`, `description`, `message`, `warning_message`.
- Runtime output envelope: `curl_command`, `headers` dictionary, plus flattened header keys (for example `Authorization`).
- Typical mapping: `secrets: { curl_command: "curl_command" }`.

## `webview`
- Purpose: start desktop webview scraping when API auth cannot be completed directly.
- Args: `url` (required), `script` (optional), `intercept_api` (optional).
- Runtime output envelope: `webview_data`; if object-like, top-level keys are also flattened into the output envelope.
- Typical mapping: `context: { payload: "webview_data" }`.

## `http`
- Purpose: execute an HTTP request.
- Args: `url` (required), `method` (default `GET`), `headers`, `timeout` (default `30`), `retries` (default `2`), `retry_backoff_seconds` (default `0.5`), `follow_redirects` (default `false`; supports boolean or boolean-like string values).
- Runtime output envelope:
  - `http_response` (JSON object/array, or `null` if response is not JSON)
  - `raw_data` (always available response text)
  - `headers` (response headers)
- Guidance: use `http_response` for JSON APIs; use `raw_data` for plain text/HTML responses.

## SQL / Database Safety Guidance
- Default authoring stance: prefer read/query-only SQL behavior.
- Write/mutation SQL should be treated as high-risk and require explicit runtime trust authorization before execution.
- SQL query text is user-authored; runtime performs SQLGlot AST risk analysis on final query text before execution.
- High-risk SQL operations route to the authorization wall protocol (`allow_once`, `allow_always`, `deny`).
- MongoDB and Redis step authoring should also stay read-only and deterministic.

## `sql`
- Purpose: execute SQL queries through backend connector runtime.
- Required args: `connector.profile`, `query`, and connection string (`dsn` or `uri`).
- Optional args: `connector.options.dialect`, `timeout`, `max_rows`.
- Runtime output envelope: `sql_response` (`rows`, `fields`, `row_count`, `duration_ms`, `truncated`, risk metadata, guardrail metadata).

## `mongodb`
- Purpose: execute read-only MongoDB operations.
- Required args: connection string (`dsn` or `uri`), `database`, `collection`, `operation` (`find` or `aggregate`).
- Optional args:
  - `connector.profile` (if provided, must be `mongodb`)
  - `filter`, `projection`, `sort` (for `find`)
  - `pipeline` (for `aggregate`)
  - `timeout`, `max_rows`
- Runtime output envelope: `mongo_response` (`rows`, `fields`, `row_count`, `duration_ms`, `truncated`, `operation`, `timeout_seconds`, `max_rows`).

## `redis`
- Purpose: execute read-only Redis commands.
- Required args: connection string (`dsn` or `uri`), `command` (`get`, `mget`, `hgetall`, `lrange`, `zrange`, `smembers`).
- Optional args:
  - `connector.profile` (if provided, must be `redis`)
  - `key`, `keys`, `start`, `stop`, `withscores` (command-specific)
  - `timeout`, `max_rows`
- Runtime output envelope: `redis_response` (`rows`, `fields`, `row_count`, `duration_ms`, `truncated`, `command`, `timeout_seconds`, `max_rows`).

## `extract`
- Purpose: extract fields from a structured object.
- Args: `source` (required), `type` (`jsonpath` or `key`, default `jsonpath`).
- Extraction expressions are declared in `outputs` (`target: expression`).
- Supports multiple mappings in a single step.

## `script`
- Purpose: run lightweight Python transformation logic.
- Args: `code` (required).
- Runtime behavior:
  - local variables are seeded from current flow variables
  - only fields explicitly mapped in `outputs`/`context` are emitted
- High-risk script behavior may be blocked by optional sandbox policy.
- Guidance: keep scripts deterministic; prefer `http` + `extract` when possible.

## `log`
- Purpose: reserved step type for explicit logging intent.
- Args: `message`.
- Runtime status: schema-defined, but no dedicated executor branch is currently wired.

---

# Examples

## JSON API Flow

```yaml
flow:
  - id: collect_key
    use: api_key
    args:
      label: "API Key"
    secrets:
      api_key: "api_key"

  - id: fetch_data
    use: http
    args:
      url: "https://api.example.com/v1/data"
      headers:
        Authorization: "Bearer {api_key}"
    context:
      data: "http_response"

  - id: parse_data
    use: extract
    args:
      source: "{data}"
      type: "jsonpath"
    outputs:
      value: "$.items[0].value"
```

## Non-JSON / Plain Text Flow

```yaml
flow:
  - id: fetch_file
    use: http
    args:
      url: "https://example.com/config"
      headers:
        User-Agent: "App/1.0"
    context:
      content: "raw_data"

  - id: parse_file
    use: script
    args:
      code: |
        import re
        m = re.search(r"traffic:\s*([0-9.]+)", content)
        value = m.group(1) if m else "unknown"
    outputs:
      traffic: "value"
```
