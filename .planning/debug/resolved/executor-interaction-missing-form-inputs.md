---
status: resolved
trigger: "core/executor.py 表单项也被归类到了RequiredSecretMissing中，应该有一个单独的missing_form_inputs所属的interaction。另外，所有interaction中使用的title和description和message都是可选的，只有配置文件中存在且是初始等待交互场景才使用配置自定义的提示文案（如输入凭证错误被打回，鉴权失败退回等，不能显示配置内提示，而是应该按照无自定义文案时退化到使用error_code对应的i18n文案。"
created: 2026-03-27T03:17:40Z
updated: 2026-03-27T03:25:36Z
---

## Current Focus

hypothesis: Fix is complete and validated by targeted + backend gate tests.
test: verify changed interaction semantics and copy fallback behavior through backend tests.
expecting: dedicated missing_form_inputs path and no custom interaction copy on invalid-credential re-entry.
next_action: report debug completion and file changes.

## Symptoms

expected: missing form inputs should map to a dedicated missing_form_inputs interaction path (not RequiredSecretMissing); title/description/message should be optional and custom copy should only appear in initial waiting interaction.
actual: form missing is grouped into RequiredSecretMissing; retry/failure callbacks still show config custom copy.
errors: interaction semantics and UI copy fallback mismatch with error_code-driven i18n expectation.
reproduction: trigger form-based auth step with missing required fields; then submit invalid credentials or cause auth failure and observe resumed interaction copy.
started: reported in current branch during executor/auth interaction behavior adjustments.

## Eliminated

- hypothesis: frontend FlowHandler is the root cause of showing config copy during invalid-credential fallback.
  evidence: FlowHandler already prefers error-code copy in error state, but backend currently sends hardcoded/custom interaction copy in recovery interactions.
  timestamp: 2026-03-27T03:21:20Z

## Evidence

- timestamp: 2026-03-27T03:21:20Z
  checked: core/steps/auth_step.py form branch
  found: form missing fields currently raise RequiredSecretMissing (code auth.missing_form_inputs) instead of dedicated form-specific exception.
  implication: missing form inputs are semantically grouped with secret-missing path.

- timestamp: 2026-03-27T03:21:20Z
  checked: core/executor.py _build_invalid_credentials_interaction
  found: form recovery interaction uses INPUT_TEXT and reuses step.args message/warning_message; other recovery interactions inject fixed title/message strings.
  implication: retry/fallback interactions can surface config or hardcoded copy rather than i18n fallback.

- timestamp: 2026-03-27T03:21:20Z
  checked: core/source_state.py InteractionRequest model
  found: title currently has default "Action Required" (non-optional semantic default).
  implication: backend model does not enforce copy-optional behavior for interactions.

- timestamp: 2026-03-27T03:25:36Z
  checked: tests/core/test_executor_auth_interactions.py + tests/core/test_form_step.py + tests/core/test_scraper_states.py
  found: targeted suite passes after introducing MissingFormInputs and removing non-initial interaction copy injection.
  implication: regression scope for auth/form interactions is covered.

- timestamp: 2026-03-27T03:25:36Z
  checked: make test-backend
  found: backend gate passed (38 passed).
  implication: no backend-wide regression detected by standard gate.

## Resolution

root_cause: Form missing-input interactions were encoded through RequiredSecretMissing and invalid-credential recovery rebuilt interactions with hardcoded/configured copy, which bypassed expected error_code i18n fallback behavior.
fix: Added dedicated MissingFormInputs interaction exception path; made interaction title/description/message optional in backend model; removed non-initial recovery interaction copy injection (title/description/message/warning_message) so fallback uses error_code i18n; aligned form recovery interaction type to input_form; added missing input_form -> error_code inference mapping; expanded regression tests.
verification: pytest -q tests/core/test_executor_auth_interactions.py tests/core/test_form_step.py tests/core/test_scraper_states.py (35 passed); make test-backend (38 passed).
files_changed:
- core/executor.py
- core/steps/auth_step.py
- core/source_state.py
- core/api.py
- tests/core/test_executor_auth_interactions.py
- tests/core/test_form_step.py
