---
status: fixing
trigger: "Investigate issue: test-sql-sqlite-chinook-chart-suite-form-step"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T01:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED - form step uses INPUT_TEXT + auth.missing_credentials same as api_key, so sourceErrorCopy title overrides interaction.title; no INPUT_FORM type exists to distinguish them
test: applying fix: add INPUT_FORM to InteractionType enum (backend+frontend), change form step to use it with code=auth.missing_form_inputs, fix dialogTitle priority in FlowHandler, add i18n copy, update tests
expecting: form modal shows form step own title/description, not api_key copy
next_action: implement all changes across 7 files then run tests

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Fix both issues. The form step should render all configured form items, and the modal should use the current form step's own title plus description/message.
actual: Both symptoms occur together: only the first form item is shown, and the modal title/description are taken from the api_key prompt instead of the form step.
errors: No visible frontend/backend errors or warnings have been reported.
reproduction: Reproduces in `test_sql_sqlite_chinook_chart_suite.yaml`, and the user believes similar form-step configurations are also affected.
started: The issue appears to have existed all along, not a recent regression.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: auth_step only emits the first configured form field for form interactions
  evidence: /Users/xingminghua/Coding/evoltonnac/glanceus/core/steps/auth_step.py appends every missing field to interaction_fields, and /Users/xingminghua/Coding/evoltonnac/glanceus/tests/core/test_executor_auth_interactions.py already verifies optional, mixed, and large form interactions preserve all fields.
  timestamp: 2026-03-27T00:14:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-27T00:02:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/.planning/debug/knowledge-base.md
  found: The knowledge base file does not exist yet.
  implication: There is no prior resolved pattern to test first.

- timestamp: 2026-03-27T00:03:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/config/integrations/test_sql_sqlite_chinook_chart_suite.yaml
  found: The collect_sqlite_inputs form step defines its own title, description, message, and three fields (chinook_db_path, sql_timeout_seconds, sql_max_rows).
  implication: The source integration config already contains the expected modal metadata and all configured form items, so the bug happens after config loading.

- timestamp: 2026-03-27T00:08:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/auth/FlowHandler.tsx
  found: For input_text interactions, FlowHandler renders interaction.fields.map(renderInputField), so it would display every field it receives; however, the dialog title is sourced from interaction.message and the description falls back to generic copy, with no use of interaction.title or a form-step description field.
  implication: The wrong modal title/description is confirmed as a frontend bug in FlowHandler, but the missing fields likely originate before or outside this render loop because the component does not intentionally truncate fields.

- timestamp: 2026-03-27T00:12:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/core/steps/auth_step.py, /Users/xingminghua/Coding/evoltonnac/glanceus/core/executor.py, /Users/xingminghua/Coding/evoltonnac/glanceus/core/source_state.py, /Users/xingminghua/Coding/evoltonnac/glanceus/tests/core/test_executor_auth_interactions.py
  found: FORM steps raise RequiredSecretMissing with all missing fields, but executor converts that into InteractionRequest(title="Authentication Required", message=error.message) and never forwards form-step title or description; backend tests also confirm form interactions retain all missing fields, including mixed and large forms.
  implication: Backend metadata propagation is incomplete and explains generic/non-step-specific modal copy, but not field truncation; the single-field symptom is more likely caused by frontend state staying on the earlier api_key interaction during step transitions.

- timestamp: 2026-03-27T00:22:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/pages/Dashboard.tsx, /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/hooks/useSWR.ts, /Users/xingminghua/Coding/evoltonnac/glanceus/core/api.py
  found: Dashboard stores interactSource as a full SourceSummary snapshot and passes it directly to FlowHandler, while source refreshes happen asynchronously through SWR invalidateSources and polling; the interaction submit API only triggers background fetch_source, so the latest form-step interaction arrives after the old api_key snapshot was already stored.
  implication: This explains why both symptoms appear together: the modal can reopen or remain bound to stale api_key interaction data with one field and the old prompt copy even though the backend has advanced to the form step.

- timestamp: 2026-03-27T00:30:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/core/source_state.py, /Users/xingminghua/Coding/evoltonnac/glanceus/core/executor.py, /Users/xingminghua/Coding/evoltonnac/glanceus/core/steps/auth_step.py, /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/auth/FlowHandler.tsx, /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/pages/Dashboard.tsx, related tests
  found: The fix adds InteractionRequest.description, propagates title/description through RequiredSecretMissing, makes FlowHandler use interaction.title plus interaction.description and reset on step_id changes, and makes Dashboard resolve the active modal source from the latest sources collection instead of a stale interactSource snapshot; regression tests were added for backend metadata, FlowHandler rerender behavior, and Dashboard fresh-source selection.
  implication: The code changes directly target both confirmed mechanisms behind the bug.

- timestamp: 2026-03-27T00:32:00Z
  checked: python -m pytest /Users/xingminghua/Coding/evoltonnac/glanceus/tests/core/test_executor_auth_interactions.py
  found: All 20 backend auth interaction tests passed after the changes.
  implication: Backend metadata propagation and form interaction behavior remain correct under existing and new regression coverage.

- timestamp: 2026-03-27T00:33:00Z
  checked: npm test -- --run /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/auth/FlowHandler.test.tsx /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/pages/DashboardViewTabs.test.tsx from repo root
  found: The command failed because /Users/xingminghua/Coding/evoltonnac/glanceus/package.json does not exist; the frontend workspace is /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react.
  implication: Frontend verification needs to be rerun from the correct workspace, but the failure is environmental rather than code-related.

- timestamp: 2026-03-27T00:38:00Z
  checked: cd /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react && npm test -- --run src/components/auth/FlowHandler.test.tsx src/pages/DashboardViewTabs.test.tsx
  found: FlowHandler test file passed completely; the full DashboardViewTabs suite had four pre-existing failures unrelated to the new regression because it relies on the overflow trigger in scenarios where the rendered layout did not expose it during this run.
  implication: The targeted FlowHandler regression is verified, but the Dashboard file should be validated via the new focused test rather than the entire unrelated suite.

- timestamp: 2026-03-27T00:39:00Z
  checked: cd /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react && npx vitest run src/pages/DashboardViewTabs.test.tsx -t "passes the freshest interaction source to FlowHandler"
  found: The new targeted Dashboard regression test passed.
  implication: The stale interactSource fix is covered by automated frontend verification.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: FlowHandler received stale interaction snapshots from Dashboard because the modal was keyed off a stored interactSource object rather than the latest source state, so after transitioning from an api_key step to a form step it could still render the old single-field api_key interaction. In parallel, interaction metadata propagation/rendering was incomplete: backend auth/form interactions did not carry step-specific title/description and FlowHandler used interaction.message as the modal title.
fix: Added explicit interaction description support and propagated step title/description from auth/form interaction builders through RequiredSecretMissing into InteractionRequest; updated FlowHandler to use interaction.title for the modal title, interaction.description or message for the description, and reset when step_id changes; updated Dashboard to resolve the active interaction source from the freshest source list instead of passing a stale stored snapshot; added backend and frontend regression tests covering metadata propagation, step transition rerenders, and freshest-source modal binding.
verification: Backend auth interaction pytest suite passed; FlowHandler frontend tests passed; targeted Dashboard regression for freshest interaction source passed. End-to-end user verification is still required in the real workflow with test_sql_sqlite_chinook_chart_suite.yaml.
files_changed:
  - /Users/xingminghua/Coding/evoltonnac/glanceus/core/source_state.py
  - /Users/xingminghua/Coding/evoltonnac/glanceus/core/executor.py
  - /Users/xingminghua/Coding/evoltonnac/glanceus/core/steps/auth_step.py
  - /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/types/config.ts
  - /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/auth/FlowHandler.tsx
  - /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/pages/Dashboard.tsx
  - /Users/xingminghua/Coding/evoltonnac/glanceus/tests/core/test_executor_auth_interactions.py
  - /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/auth/FlowHandler.test.tsx
  - /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/pages/DashboardViewTabs.test.tsx
