# Glancier Flow Architecture and Orchestration

## 1. Goal

Flow is the integration execution pipeline. It is responsible for:
- Authentication and credential recovery (`api_key` / `oauth` / `curl` / `webview`)
- Data fetching and parsing (`http` / `extract` / `script`)
- Blocking interactions and resume execution (`NeedsInteraction -> user action -> resume`)

## 2. Generic Step Output Model

Each `flow` step supports these output channels. All channels can be referenced as `{var}`
in later steps, but they differ in persistence and security:

| Field | Persistence | Security | Primary Use |
| --- | --- | --- | --- |
| `outputs` | Persisted to Data Store | Public/display data | Final user-facing values (balance/progress/text). |
| `secrets` | Persisted to Secret Store | Encrypted/protected | Sensitive credentials (API Key, OAuth token, session). |
| `context` | In-memory only | Ephemeral | Intermediate variables for downstream steps. |

Mapping format is unified for `outputs` / `secrets` / `context`:
`target_var: source_path`

Example:

```yaml
- id: fetch_api
  use: http
  args:
    url: "https://api.example.com/data"
  outputs:
    display_value: "result.value"     # persisted to data.json
  secrets:
    new_token: "headers.X-New-Token"  # persisted to secrets.json (encrypted)
  context:
    temp_id: "result.id"              # memory only
```

## 3. Variable Resolution Priority

When resolving `{var}` in `args`, priority is:
1. Previous-step `outputs` (short scope)
2. Flow context variables
3. Persisted secrets

## 4. Blocking Execution Model

When a step requires user input and no valid credentials are available:
1. Python marks `NeedsInteraction`
2. UI renders the required interaction
3. User submits interaction data
4. Flow resumes from the interruption point

This model applies to `api_key`, `oauth`, `curl`, and `webview`.

## 5. Boundary with SDUI and WebView

- Flow produces data and runtime state; SDUI renders it: [../sdui/README.md](../sdui/README.md)
- WebView step capabilities come from the Scraper subsystem: [../webview-scraper/README.md](../webview-scraper/README.md)
