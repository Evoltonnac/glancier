---
status: resolved
trigger: "integration-top-level-schema-drift"
created: 2026-03-16T15:45:00.000Z
updated: 2026-03-16T15:55:00.000Z
---

## Current Focus
hypothesis: "Schema generation model and skill/docs prompt drifted from runtime IntegrationConfig contract."
test: "Align schema model fields with runtime contract, regenerate artifacts, update docs/skills, and run impacted tests."
expecting: "Top-level integration contract consistent across code, schemas, docs, and skill prompts."
next_action: "Closed as resolved"

## Symptoms
expected: |
  Integration YAML top-level fields should be explicitly documented and consistently enforced across runtime code, generated schemas, and skill prompts.
actual: |
  Runtime code accepted optional flow and default_refresh_interval_minutes, but generated schemas omitted default_refresh_interval_minutes and required flow.
  Docs/skills prompts did not document the full top-level contract nor the filename-derived id rule.
errors: none
reproduction: Inspect core/config_loader.py, config/schemas/*.json, docs/, and skills prompt files.
started: Unknown (introduced before this debug session)

## Eliminated
- Runtime IntegrationConfig contract mismatch (runtime code itself was already correct)

## Evidence
- timestamp: 2026-03-16
  checked: scripts/generate_schemas.py
  found: |
    IntegrationYamlConfig omitted `default_refresh_interval_minutes` and required `flow`.
  implication: Generated schema drift from runtime contract.

- timestamp: 2026-03-16
  checked: docs and skills prompt files
  found: |
    No explicit integration top-level field list or filename-derived id rule.
  implication: Authoring guidance drift from runtime behavior.

## Resolution
root_cause: |
  Contract duplication without synchronization guardrails:
  1) Schema generator used a local model that lagged behind core IntegrationConfig.
  2) Docs and skill prompt text were not updated after runtime contract evolution.

fix: |
  1) Updated IntegrationYamlConfig in scripts/generate_schemas.py:
     - added optional `default_refresh_interval_minutes` (ge=0)
     - made `flow` optional
  2) Added regression assertions in tests/core/test_generate_schemas.py for these fields/required semantics.
  3) Regenerated config/schemas/integration.python.schema.json and integration.schema.json.
  4) Added explicit top-level contract + filename id injection rule to docs and skill sources.
  5) Regenerated ui-react/src/constants/integrationSkillPrompt.ts from skills/PROMPT.md.

verification: "make test-impacted passed (29 backend tests + frontend core tests + typecheck)"

files_changed:
  - scripts/generate_schemas.py
  - tests/core/test_generate_schemas.py
  - config/schemas/integration.python.schema.json
  - config/schemas/integration.schema.json
  - docs/flow/01_architecture_and_orchestration.md
  - skills/integration-editor/SKILL.md
  - skills/integration-editor/references/flow-patterns.md
  - skills/PROMPT.md
  - ui-react/src/constants/integrationSkillPrompt.ts
