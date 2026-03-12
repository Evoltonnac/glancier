---
phase: quick
plan: 10
type: execute
wave: 1
depends_on: []
files_modified:
  - core/config_loader.py
  - core/bootstrap.py
  - ui-react/src/types/config.ts
  - ui-react/src/pages/Dashboard.tsx
  - docs/view_template_configuration.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "Templates use 'id' as their unique identifier instead of 'label'"
    - "The 'label' field is no longer mandatory for identification, reducing duplication with 'ui.title'"
  artifacts:
    - path: "core/config_loader.py"
      provides: "Updated ViewComponent model"
    - path: "ui-react/src/pages/Dashboard.tsx"
      provides: "Dashboard using template.id"
  key_links: []
---

<objective>
Refactor ViewComponent templates to use a dedicated `id` field instead of overloading `label` as the `template_id`. Clarify the separation between data identification (`id`) and UI presentation (`ui.title`).
</objective>

<context>
Currently, `label` in templates is used as the `template_id` when adding widgets, which is semantically incorrect and overlaps with `ui.title` intended for display. We need to introduce an explicit `id` field and adjust the Dashboard to use it.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update Python Backend Models and Starter Data</name>
  <files>core/config_loader.py, core/bootstrap.py</files>
  <action>
    1. In `core/config_loader.py`, update the `ViewComponent` class:
       - Add `id: str = ""` (or make it optional if backward compatibility is strictly needed).
       - Make `label` optional (`label: Optional[str] = None`) to phase it out.
    2. In `core/bootstrap.py`, update `STARTER_SCENARIOS`:
       - In `integration_yaml` strings, replace `label: "..."` in the `templates` section with `id: "..."` (maybe something like "template_xxx").
       - Keep `ui: { title: "..." }` as the display title.
       - Update the `template_label` usages to map to the new `id`.
  </action>
  <verify>
    <automated>python -c "from core.config_loader import ViewComponent; assert 'id' in ViewComponent.model_fields"</automated>
  </verify>
  <done>Python data models and starter templates correctly define and use the `id` field.</done>
</task>

<task type="auto">
  <name>Task 2: Update React Types and Dashboard UI</name>
  <files>ui-react/src/types/config.ts, ui-react/src/pages/Dashboard.tsx</files>
  <action>
    1. In `ui-react/src/types/config.ts`, update `interface ViewComponent`:
       - Add `id?: string;`
       - Make `label` optional: `label?: string;`
    2. In `ui-react/src/pages/Dashboard.tsx`, update `handleAddWidget` and related mapping logic:
       - Change `template_id: template.label || template.type || ""` to `template_id: template.id || template.label || template.type || ""`.
       - Ensure widget rendering falls back to `ui.title` if `label` is missing.
  </action>
  <verify>
    <automated>npm --prefix ui-react run typecheck</automated>
  </verify>
  <done>React frontend correctly maps `template.id` to `template_id` when adding widgets to the dashboard.</done>
</task>

<task type="auto">
  <name>Task 3: Regenerate Schemas and Update Docs</name>
  <files>docs/view_template_configuration.md</files>
  <action>
    1. Run `python scripts/generate_schemas.py` to regenerate the JSON schemas based on the updated Pydantic models and TypeScript interfaces.
    2. Update `docs/view_template_configuration.md` examples to use `id: "..."` instead of `label: "..."` in the `templates` array examples.
  </action>
  <verify>
    <automated>python scripts/generate_schemas.py</automated>
  </verify>
  <done>JSON schemas are successfully regenerated and documentation reflects the new `id` field usage.</done>
</task>

</tasks>

<success_criteria>
- Templates in configuration files are uniquely identified by an `id` field.
- The `label` field is decoupled from logic and marked as optional/deprecated.
- The dashboard successfully instantiates and saves widgets using the new `template_id` mapping.
</success_criteria>