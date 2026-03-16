# Glanceus Flow Architecture and Orchestration

## 1. Goal

Flow is the integration execution pipeline. It is responsible for:
- Authentication and credential recovery (`api_key` / `oauth` / `curl` / `webview`)
- Generic runtime input collection (`form`)
- Data fetching and parsing (`http` / `extract` / `script`)
- Blocking interactions and resume execution (`NeedsInteraction -> user action -> resume`)

## 1.1 Integration YAML Top-Level Contract

`config/integrations/*.yaml` supports these top-level fields:

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `name` | No | `string \| null` | Display name for the integration. |
| `description` | No | `string \| null` | Human-readable description. |
| `default_refresh_interval_minutes` | No | `integer \| null` (>= 0) | Integration-level default auto-refresh interval. `null` means unset, `0` means disabled. |
| `flow` | No | `Step[] \| null` | Flow definition used by sources inheriting this integration. |
| `templates` | No | `ViewComponent[]` | SDUI templates. Defaults to an empty list. |

`id` is not a valid top-level YAML field for integration files. Runtime `id` is always injected from filename:
- `config/integrations/openai.yaml` -> integration id `openai`
- inline YAML `id` (if present) is ignored and replaced by filename id

## 2. Step Output Channels

Each `flow` step supports three output channels to map execution results to different storage domains. All variables defined in these channels can be referenced in subsequent steps using `{var}`.

| Field | Persistence | Security | Lifecycle | Primary Use |
| --- | --- | --- | --- | --- |
| `secrets` | **Persistent** (Secret Store) | **Encrypted** | Long-term | **Mandatory** for API Keys, OAuth Tokens, and sensitive session data. |
| `outputs` | **Persistent** (Data Store) | **Public/Plaintext** | Long-term | Final data for UI display (balances, progress, text, etc.). |
| `context` | **In-memory only** | Ephemeral/Plaintext | Flow-only | Intermediate variables for downstream steps (not for display). |

### Design Guidelines and Security Mandates

1.  **Sensitive Information MUST use `secrets`**: Never map API Keys or tokens to `outputs` or `context`. `outputs` are stored in plaintext in `data.json`, and while `context` is not persisted, it is handled as plaintext in memory.
2.  **Display Data maps to `outputs`**: Only map data that needs to be bound to SDUI templates to `outputs`. Avoid mapping intermediate calculation results here to reduce storage redundancy.
3.  **Flow-only Variables use `context`**: Use `context` for temporary data (e.g., from `extract` or `script`) that is only needed by subsequent steps and not intended for the UI.
4.  **Risk of Context Loss during Interaction**: When a step triggers `NeedsInteraction` (e.g., OAuth authorization, CAPTCHA), the flow execution is suspended.
    - **Risk**: `context` variables exist only in memory and are **not persisted** during the suspension.
    - **Mitigation**: The flow usually restarts from the beginning upon resumption. Ensure steps are idempotent or map critical non-sensitive intermediate variables to `outputs` if they must survive the interaction.

### Mapping Example

```yaml
- id: fetch_api
  use: http
  args:
    url: "https://api.example.com/data"
  outputs:
    display_value: "result.value"     # Persisted to data.json for UI display
  secrets:
    new_token: "headers.X-New-Token"  # Persisted to secrets.json (encrypted)
  context:
    temp_id: "result.id"              # In-memory only, for downstream steps
```

## 3. Variable Resolution Priority

When resolving `{var}` in `args`, the priority is:
1. Global flow environment `context`
2. Persisted `secrets`
3. Previous-step mapped `outputs` (Short scope fallback)

## 4. Blocking Execution Model

When a step requires user input and no valid credentials are available:
1. Python marks `NeedsInteraction`
2. UI renders the required interaction
3. User submits interaction data
4. Flow resumes from the interruption point

This model applies to `api_key`, `form`, `oauth`, `curl`, and `webview`.

## 5. Boundary with SDUI and WebView

- Flow produces data and runtime state; SDUI renders it: [../sdui/01_architecture_and_guidelines.md](../sdui/01_architecture_and_guidelines.md)
- WebView step capabilities come from the Scraper subsystem: [../webview-scraper/01_architecture_and_dataflow.md](../webview-scraper/01_architecture_and_dataflow.md)
