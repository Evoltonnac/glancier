---
phase: quick
plan: 11
type: execute
wave: 1
depends_on: []
files_modified:
  - core/config_loader.py
  - ui-react/src/types/config.ts
  - config/schemas/integration.schema.json
  - config/schemas/integration.python.schema.json
  - config/schemas/integration.sdui.schema.json
  - ui-react/src/pages/Dashboard.tsx
  - config/integrations/github_oauth.yaml
  - config/integrations/oauth_example.yaml
  - config/integrations/openrouter_keys_apikey.yaml
  - config/integrations/soniox_dashboard_webview.yaml
autonomous: true
requirements:
  - QUICK-11
must_haves:
  truths:
    - "ViewComponent `id` is properly typed as a required string instead of optional."
    - "All existing integration YAML files provide a valid `id` for each item in the `templates` array."
    - "The JSON schemas reflect the new required `id` structure."
  artifacts:
    - path: core/config_loader.py
      provides: Required ViewComponent.id
    - path: ui-react/src/types/config.ts
      provides: Required ViewComponent.id
    - path: config/schemas/integration.schema.json
      provides: Updated schema definition
  key_links:
    - from: ui-react/src/pages/Dashboard.tsx
      to: ui-react/src/types/config.ts
      via: template.id
      pattern: "template_id: template.id"
---

<objective>
将 templates config 中的 `id` 设为必填字段，并修改当前已有集成的 templates 以补齐 `id`。

Purpose: Ensure each template configuration has an explicit `id` rather than implicitly falling back to optional fields, reducing potential layout bugs.
Output: Updated Python model, TypeScript interfaces, JSON schemas, Dashboard usage, and all 4 main integration YAML files with explicit `id` attributes.
</objective>

<execution_context>
@/Users/xingminghua/.gemini/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@core/config_loader.py
@ui-react/src/types/config.ts
@ui-react/src/pages/Dashboard.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update type definitions and schemas</name>
  <files>core/config_loader.py, ui-react/src/types/config.ts, config/schemas/integration.schema.json, config/schemas/integration.python.schema.json, config/schemas/integration.sdui.schema.json</files>
  <action>
    1. In `core/config_loader.py`: Modify `class ViewComponent(BaseModel):` to change `id: str = ""` to `id: str`.
    2. In `ui-react/src/types/config.ts`: Modify `export interface ViewComponent {` to change `id?: string;` to `id: string;`.
    3. Run `python scripts/generate_schemas.py` to regenerate JSON schemas under `config/schemas/` to reflect that `id` is now a required property.
  </action>
  <verify>
    <automated>python scripts/generate_schemas.py</automated>
  </verify>
  <done>Model structures correctly enforce `id` requirement and JSON schemas are updated.</done>
</task>

<task type="auto">
  <name>Task 2: Update existing code usage and integrations</name>
  <files>ui-react/src/pages/Dashboard.tsx, config/integrations/github_oauth.yaml, config/integrations/oauth_example.yaml, config/integrations/openrouter_keys_apikey.yaml, config/integrations/soniox_dashboard_webview.yaml</files>
  <action>
    1. In `ui-react/src/pages/Dashboard.tsx` at line ~302 `handleAddWidget`, update:
       `template_id: template.id || template.label || template.type || ""`
       to `template_id: template.id`.
    2. In `config/integrations/github_oauth.yaml`, under `templates:`, add `id: github_api_limits` to the first template block.
    3. In `config/integrations/oauth_example.yaml`, under `templates:`, add `id: oauth_profile` to the template block.
    4. In `config/integrations/openrouter_keys_apikey.yaml`, under `templates:`, add `id: openrouter_usage` to the template block.
    5. In `config/integrations/soniox_dashboard_webview.yaml`, under `templates:`, add `id: soniox_usage` to the template block.
  </action>
  <verify>
    <automated>npm --prefix ui-react run typecheck</automated>
  </verify>
  <done>All integration YAMLs contain an `id` for their templates and the TypeScript code compiles successfully.</done>
</task>

</tasks>

<verification>
Ensure typecheck passes for React components.
</verification>

<success_criteria>
`id` is strictly typed as a required string in all models. Existing integration configs are patched. The application UI can successfully load all existing YAML files without parsing errors.
</success_criteria>

<output>
After completion, create `.planning/phases/quick/{phase}-{plan}-SUMMARY.md`
</output>