---
name: integration-editor
description: "Canonical skill for creating and editing Glanceus integration YAML with deterministic create/edit/fallback behavior."
---

# Glanceus Integration Editor

`integration-editor` is the canonical path for AI-assisted integration YAML authoring.
This skill keeps structured sources (`SKILL.md` + `references/`) as the authoritative behavior contract.

## Packaging Contract (create-skill style)

- Keep the skill in the planned location: `skills/integration-editor/`.
- Keep these source files as the canonical source of truth:
  - `skills/integration-editor/SKILL.md`
  - `skills/integration-editor/references/flow-patterns.md`
  - `skills/integration-editor/references/sdui-components.md`
- Do not remove `references/`; they are required for accurate flow and SDUI behavior constraints.

## Sync Order (Must Follow)

Always update in this strict order:
1. Codebase code (actual runtime/schema behavior)
2. Codebase docs (project-level docs under `docs/` and root contracts)
3. Skill sources (`SKILL.md` + `references/`)

## Authoring Order (Required)

1. Update `SKILL.md`.
2. Update `references/` files.
3. Validate skill frontmatter:
   - `cd skills/integration-editor && python scripts/quick_validate.py .`

## Canonical Ownership

- Use this skill for both create and edit requests on integration YAML.
- Treat this file and `references/` as canonical authoring sources.

## Deterministic Modes

1. **create mode**
- Generate a complete integration YAML package (top-level config, flow, templates).
- Return full file content rather than partial snippets.
- Keep auth -> fetch -> parse -> render flow explicit and traceable.

2. **edit mode**
- Edit only the sections requested by the user.
- Preserve untouched sections exactly unless the user asks for wider changes.
- Explain what changed and what intentionally remained unchanged.

## Integration File Top-Level Contract

For `config/integrations/*.yaml`, use these top-level fields:
- optional `name`
- optional `description`
- optional `default_refresh_interval_minutes` (integer >= 0; `0` disables auto refresh)
- optional `flow`
- optional `templates` (defaults to empty list)

Refresh interval behavior reference:
- Source/global runtime intervals support `0` (disabled) or `1..10080` minutes.
- UI preset options (`off`, `5m`, `30m`, `1h`, `1d`) are convenience choices, not the full runtime range.

Refresh interval authoring rules:
- Do not set `default_refresh_interval_minutes: 0` only because the flow contains a `webview` step.
- Prefer a positive interval (for example `30` or `60`) when WebView is mainly for first-time login and downstream requests can keep/refresh session or token state.
- Use `0` only when refresh usually requires fresh manual interaction on most runs (for example repeated captcha/login walls), or when the user explicitly asks for manual-only refresh.

Do not author `id` in integration YAML files. Runtime `id` comes from the filename:
- `config/integrations/github.yaml` -> `id = github`
- If inline `id` exists, it is ignored and replaced by filename id

## Prerequisite Gate

- Before writing YAML, check required prerequisites:
  - target platform and API entrypoint
  - auth strategy (api_key, form, oauth, webview)
  - expected outputs/metrics/signals
  - target UI card intent
- If prerequisites are missing, ask concise clarifying questions first.
- Do not invent unavailable credentials, scopes, or undocumented endpoints.

## Risky Data Operation Policy

- For SQL/database-style authoring, default to read/query-only patterns unless the user explicitly requests write behavior.
- If write/mutation behavior is required, clearly mark it as high-risk and indicate runtime trust authorization is required before execution.
- Never present write/mutation operations as safe-by-default or silently-enabled behavior.
- Treat SQL as fully user-authored query text; do not invent hidden parameter-injection layers.
- Explain that SQLGlot AST risk analysis is applied to final query text before execution.
- Explain that high-risk SQL routes to the authorization wall trust protocol (`allow_once`, `allow_always`, `deny`).

## Fallback Policy (Local-First)

- Prefer local context first: existing project files, current integration YAML, and local docs.
- Use external fallback only when local context is insufficient.
- Any fallback usage must disclose:
  - reason fallback was needed
  - source category used (docs/api/community examples)
  - limitations and confidence level
- Never present fallback assumptions as verified facts.

## Validation Guidance (Optional Final Step)

- Validation is optional-final when the environment is constrained.
- If execution is possible, run available checks for impacted files.
- If execution is not possible, provide concrete validation commands and expected pass signals.
- Always distinguish "validated" from "not executed" outcomes.

## Execution Workflow

1. Confirm mode (`create mode` or `edit mode`).
2. Use `references/flow-patterns.md` and `references/sdui-components.md` as domain constraints.
3. Confirm prerequisites; ask for missing fields before generating YAML.
4. Choose step semantics explicitly: use `api_key` for credential-focused auth inputs, use `form` for generic multi-field input collection.
5. Produce or update YAML deterministically, respecting mode scope.
6. Apply fallback disclosure and optional-final validation status in the final response.

## SDUI Authoring Notes

- `color` is the shared semantic color field for supported non-chart widgets and overrides `tone` when both are present.
- `Chart.*` widgets keep `colors` as the array form of the same semantic color enum.
- Layout widgets may expose both `align_x` and `align_y`; do not assume only one axis is available.
- Layout widgets also expose axis-aware size controls where supported: `Container.height`, `ColumnSet.height`, `Column.width`, and `Column.height` all accept `auto` | `stretch` | positive number.
- Numeric layout size values are field-specific: `Container.height` / `ColumnSet.height` and `Column.width` behave as flex weights, while `Column.height` is a fixed pixel height.

## Simple Complete YAML Example

Use this as a minimal but end-to-end baseline (auth -> fetch -> parse -> render):

```yaml
name: "Example API Snapshot"
description: "Fetch usage data with API key auth and render a compact source card."
flow:
  - id: collect_api_key
    use: api_key
    args:
      label: "API Key"
      description: "Enter your API key."
    secrets:
      api_key: "api_key"

  - id: fetch_usage
    use: http
    args:
      url: "https://api.example.com/v1/usage"
      method: "GET"
      headers:
        Authorization: "Bearer {api_key}"
        Accept: "application/json"
    context:
      usage_payload: "http_response"

  - id: parse_usage
    use: extract
    args:
      source: "{usage_payload}"
      type: "jsonpath"
    outputs:
      metric_value: "$.usage.current"
      metric_limit: "$.usage.limit"
      usage_percent: "$.usage.percent"
      signal_label: "$.usage.status"
      updated_at: "$.usage.updated_at"
      top_items: "$.usage.top_items"

  - id: summarize
    use: script
    args:
      code: |
        value = float(metric_value or 0)
        limit = float(metric_limit or 0)
        percent = float(usage_percent or 0)
        remaining = max(limit - value, 0)
        if percent >= 90:
            signal_tone = "danger"
        elif percent >= 70:
            signal_tone = "warning"
        else:
            signal_tone = "success"
    outputs:
      remaining_value: "remaining"
      signal_tone: "signal_tone"

templates:
  - id: "usage_snapshot"
    type: "source_card"
    ui:
      title: "Usage Snapshot"
      icon: "📊"
    widgets:
      - type: "Container"
        spacing: "md"
        items:
          - type: "TextBlock"
            text: "{metric_value}"
            size: "xl"
            weight: "bold"
          - type: "Progress"
            value: "{usage_percent}"
            label: "Usage {usage_percent}%"
            thresholds:
              warning: 70
              danger: 90
          - type: "FactSet"
            facts:
              - label: "Limit"
                value: "{metric_limit}"
              - label: "Remaining"
                value: "{remaining_value}"
              - label: "Updated"
                value: "{updated_at}"
          - type: "List"
            data_source: "{top_items}"
            item_alias: "item"
            render:
              - type: "TextBlock"
                text: "{item.name}: {item.value}"
                size: "sm"
                tone: "muted"
          - type: "Badge"
            text: "{signal_label}"
            tone: "{signal_tone}"
          - type: "ActionSet"
            actions:
              - type: "Action.OpenUrl"
                title: "Open Dashboard"
                url: "https://app.example.com/dashboard"
              - type: "Action.Copy"
                title: "Copy Status"
                text: "{signal_label}"
```

## References

- `skills/integration-editor/references/flow-patterns.md`
- `skills/integration-editor/references/sdui-components.md`
