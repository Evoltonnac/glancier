# Glanceus Flow Patterns (Current)

This reference defines practical Flow authoring patterns for integration YAML in Glanceus.

## 1. Source of Truth

Use these in priority order:
1. Code and schemas (`config/schemas/integration.schema.json`)
2. Flow docs (`docs/flow/01_architecture_and_orchestration.md`, `docs/flow/02_step_reference.md`, `docs/flow/03_step_oauth.md`)
3. Working integration examples (`config/integrations/*.yaml`)

If examples conflict with docs, prefer current code/schema behavior.

## 2. Integration Top-Level Contract

For `config/integrations/*.yaml`, valid top-level fields are:
- optional `name`
- optional `description`
- optional `default_refresh_interval_minutes` (integer >= 0; `0` disables auto refresh)
- optional `flow`
- optional `templates` (defaults to empty list)

Do not author `id` inline. Runtime integration id is always derived from filename:
- `config/integrations/openai.yaml` -> `id = openai`
- Inline `id` (if present) is ignored and replaced by filename id

## 3. Minimum Step Contract

Each flow step should include:
- `id` (required)
- `use` (required)
- optional `args`, `outputs`, `context`, `secrets`, `run`

Current `use` values:
- `http`
- `oauth`
- `api_key`
- `form`
- `curl`
- `extract`
- `script`
- `log`
- `webview`

## 4. Step Roles

| Step | Purpose | Typical Notes |
| --- | --- | --- |
| `api_key` | Collect API token from user interaction | Credential-focused auth input; persist token in `secrets` |
| `form` | Collect generic user-provided fields | Supports multi-field input; persistence depends on mapping (`secrets`/`outputs`/`context`) |
| `oauth` | Run OAuth flow and persist token bundle | Use `oauth_secrets.access_token` in downstream HTTP headers |
| `curl` | Collect browser-captured cURL input | Use when API auth is not straightforward |
| `webview` | Desktop-assisted browser interception | Use for platforms without stable public API |
| `http` | Fetch data from remote endpoint | Map response into `outputs`/`context` |
| `extract` | Pull fields from structured payloads | `type` often `jsonpath` or `key` |
| `script` | Lightweight transformation/aggregation | Keep deterministic and bounded |
| `log` | Emit debugging breadcrumbs | Useful in investigation or migrations |

## 5. Output Channels and Persistence

Each step may map values into three channels:

| Field | Persistence | Security | Use |
| --- | --- | --- | --- |
| `secrets` | Persistent | Encrypted | Credentials, token bundles, sensitive session state |
| `outputs` | Persistent | Plaintext | Display-facing data for templates/widgets |
| `context` | In-memory only | Plaintext | Intermediate values for downstream steps |

Rules:
- Always map credentials/tokens to `secrets`.
- Use `outputs` only for values needed in UI or durable data snapshots.
- Use `context` for temporary intermediate values.

## 6. Variable Resolution Priority

When resolving `{var}` in step args:
1. Flow runtime context
2. Persisted secrets
3. Previously mapped outputs

Design expressions so this precedence does not create ambiguous names.

## 7. Canonical Patterns

### Pattern A: API Key -> HTTP -> Extract

```yaml
flow:
  - id: collect_api_key
    use: api_key
    args:
      label: "API Key"
      description: "Enter your API token"
    secrets:
      api_key: "api_key"

  - id: fetch_metrics
    use: http
    args:
      url: "https://api.example.com/v1/metrics"
      method: "GET"
      headers:
        Authorization: "Bearer {api_key}"
        Accept: "application/json"
    outputs:
      metrics_payload: "http_response"

  - id: parse_metrics
    use: extract
    args:
      source: "{metrics_payload}"
      type: "jsonpath"
    outputs:
      total_value: "$.total"
      trend_label: "$.trend"
```

### Pattern B: OAuth -> HTTP with token bundle

```yaml
flow:
  - id: authorize
    use: oauth
    args:
      oauth_flow: "device"
      device_authorization_url: "https://provider.example.com/oauth/device/code"
      token_url: "https://provider.example.com/oauth/token"
      scopes: ["read"]
      client_id: "REPLACE_ME"
    secrets:
      oauth_secrets: "oauth_secrets"

  - id: fetch_profile
    use: http
    args:
      url: "https://provider.example.com/api/profile"
      method: "GET"
      headers:
        Authorization: "Bearer {oauth_secrets.access_token}"
    outputs:
      profile_payload: "http_response"
```

### Pattern C: Form -> HTTP (non-token runtime input)

```yaml
flow:
  - id: collect_query_form
    use: form
    args:
      fields:
        - key: account_id
          label: "Account ID"
          type: "text"
        - key: region
          label: "Region"
          default: "us"
    secrets:
      provider_account_id: "account_id"
    context:
      region: "region"

  - id: fetch_profile
    use: http
    args:
      url: "https://api.example.com/v1/accounts/{provider_account_id}?region={region}"
      method: "GET"
    outputs:
      profile_payload: "http_response"
```

### Pattern D: WebView interception -> Extract

```yaml
flow:
  - id: webview_fetch
    use: webview
    args:
      url: "https://console.example.com"
      intercept_api: "/dashboard"
    outputs:
      dashboard_payload: "webview_data"

  - id: parse_dashboard
    use: extract
    args:
      source: "{dashboard_payload}"
      type: "jsonpath"
    outputs:
      balance: "$.billing.available_balance"
      currency: "$.billing.currency"
```

### Pattern E: Script summarization

```yaml
flow:
  - id: summarize
    use: script
    args:
      code: |
        # Keep script deterministic and bounded.
        item_count = len(items or [])
        healthy = item_count > 0
    outputs:
      item_count: "item_count"
      healthy: "healthy"
```

## 8. Interaction and Resume Notes

`api_key`, `form`, `oauth`, `curl`, and `webview` can suspend execution with an interaction state.

Design implications:
- Keep pre-interaction steps idempotent.
- Do not depend on `context` surviving long suspensions.
- Persist required cross-resume values in `secrets` or `outputs`.

## 9. Common Errors to Avoid

- Storing tokens in `outputs`.
- Flat token naming when token bundle exists (`access_token` instead of `oauth_secrets.access_token`).
- Overloading `outputs` with temporary-only values.
- Treating `form` as an auth-only step (prefer `api_key` when intent is credential authentication).
- Using unsupported `use` step names.
- Mixing template-layer logic into flow (flow fetches/parses; SDUI renders).

## 10. Authoring Checklist

- [ ] Step `id` and `use` are present for every step.
- [ ] Sensitive values map to `secrets` only.
- [ ] UI-facing fields map to `outputs`.
- [ ] Temporary-only fields stay in `context`.
- [ ] OAuth references use `oauth_secrets.*` dotted paths.
- [ ] Blocking steps are idempotent/resume-safe.
