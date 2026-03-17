---
phase: quick
plan: 260317-uyq
type: execute
wave: 1
depends_on: []
files_modified:
  - core/steps/http_step.py
  - core/executor.py
  - tests/core/test_http_step.py
  - tests/core/test_scraper_states.py
  - ui-react/src/i18n/messages/en.ts
  - ui-react/src/i18n/messages/zh.ts
autonomous: true
requirements: []
---

<objective>
Fix timeout error handling end-to-end so HTTP timeout failures no longer collapse to `runtime.flow_step_failed`, and frontend can render dedicated timeout copy in both EN/ZH.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Add runtime timeout classification in backend</name>
  <files>core/steps/http_step.py, core/executor.py</files>
  <action>
Add `NetworkTimeoutError` with code `runtime.network_timeout`; classify retried timeout failures in HTTP step via executor helper, and let this exception bypass flow-step generic wrapping.
  </action>
  <verify>
    <automated>pytest -q tests/core/test_http_step.py tests/core/test_scraper_states.py</automated>
  </verify>
  <done>Timeout failures preserve dedicated code through fetch-source error formatting path.</done>
</task>

<task type="auto">
  <name>Task 2: Add regression coverage for timeout code persistence</name>
  <files>tests/core/test_http_step.py, tests/core/test_scraper_states.py</files>
  <action>
Update HTTP-step retry-exhausted assertion to expect `NetworkTimeoutError`, and add executor-level test proving persisted `error_code` is `runtime.network_timeout`.
  </action>
  <verify>
    <automated>make test-backend</automated>
  </verify>
  <done>Backend tests lock timeout code behavior and prevent fallback regression to `runtime.flow_step_failed`.</done>
</task>

<task type="auto">
  <name>Task 3: Add EN/ZH timeout i18n entries</name>
  <files>ui-react/src/i18n/messages/en.ts, ui-react/src/i18n/messages/zh.ts</files>
  <action>
Add `error.copy.runtime.network_timeout.*` and `error.code.runtime.network_timeout` in both locales for frontend rendering by code.
  </action>
  <verify>
    <automated>make test-frontend && make test-typecheck</automated>
  </verify>
  <done>Frontend can show dedicated timeout message without falling back to generic runtime text.</done>
</task>

</tasks>

<success_criteria>
- Timeout exceptions from HTTP step map to `runtime.network_timeout`
- Timeout errors are not wrapped into `runtime.flow_step_failed`
- Backend tests pass with timeout regression coverage
- EN/ZH i18n include dedicated timeout code + copy keys
</success_criteria>

<output>
After completion, create `.planning/quick/260317-uyq-i18n/260317-uyq-SUMMARY.md`
</output>
