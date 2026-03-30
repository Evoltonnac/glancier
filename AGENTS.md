# AGENTS.md — AI Engineering Contract for Glanceus

This document defines the minimum required behavior for AI agents working in this repository.

## 1. Project Purpose and Product Goal

Glanceus is a config-first personal data hub.

Primary goal:
- Let users complete **auth -> fetch -> parse -> render** with integration YAML and templates, without hardcoding new platform logic in Python.

Core requirements:
- Keep terminology consistent with [`docs/terminology.md`](docs/terminology.md): **Metric**, **Signal**, **Integration Data**, **Bento Card**.
- Preserve backend/frontend boundary: frontend renders data, backend owns workflow/auth/state.
- Prefer minimal, reversible, testable changes.

## 2. Technology Framework (Core)

Backend:
- Python 3.10+
- FastAPI, APScheduler, Pydantic v2, httpx, TinyDB
- Authlib for OAuth flows

Frontend/Desktop:
- React 18 + TypeScript + Vite
- Tailwind CSS + widget-based SDUI rendering
- Tauri v2 desktop shell

Data and runtime:
- Local JSON/TinyDB storage under `GLANCEUS_DATA_DIR`
- Local encrypted secrets storage

## 3. Core Directory Map

- `main.py`: app bootstrap, dependency wiring, lifecycle
- `core/api.py`: API contracts and orchestration endpoints
- `core/executor.py`: flow execution engine
- `core/steps/`: step handlers (`http`, `oauth`, `webview`, `extract`, etc.)
- `core/config_loader.py`: YAML schema parsing/validation
- `core/resource_manager.py`: sources/views persistence
- `config/integrations/`: integration YAML definitions
- `config/schemas/`: generated integration/schema artifacts consumed by tooling and UI validation
- `scripts/generate_schemas.py`: unified schema generation entrypoint
- `ui-react/src/`: React UI, SDUI widgets, pages, state hooks
- `skills/`: canonical AI skill assets and prompt-engineering sources for integration authoring
- `docs/`: architecture, flow, SDUI, testing, build contracts

## 4. Docs Map and Skills Assets

Use this section as the first-stop index for repository documentation and AI skill assets.

Docs map:
- `docs/terminology.md`: shared vocabulary for product, data, and UI.
- `docs/flow/01_architecture_and_orchestration.md`: high-level flow orchestration and variable channels.
- `docs/flow/02_step_reference.md`: per-step contract and authoring reference.
- `docs/flow/03_step_oauth.md`: OAuth step behavior and recovery guidance.
- `docs/flow/04_step_failure_test_inputs.md`: failure/regression scenario inputs.
- `docs/flow/05_refresh_scheduler_and_retry.md`: refresh scheduler and retry semantics.
- `docs/flow/06_storage_contract_and_migration.md`: storage contract and startup migration.
- `docs/sdui/01_architecture_and_guidelines.md`: SDUI architecture and template guidelines.
- `docs/sdui/02_component_map_and_categories.md`: SDUI component taxonomy and maintenance rules.
- `docs/sdui/03_template_expression_spec.md`: expression syntax and safety boundary.
- `docs/sdui/04_widget_layout_contract.md`: SDUI widget layout strategies and responsive card shell contract.
- `docs/webview-scraper/01_architecture_and_dataflow.md`: scraper subsystem dataflow.
- `docs/webview-scraper/02_runtime_and_fallback.md`: runtime constraints and fallback behavior.
- `docs/frontend/01_engineering_guide.md`: frontend engineering rules and dashboard state contracts.
- `docs/ui_design_guidelines.md`: high-density UI principles and component-level guidance.
- `docs/testing_tdd.md`: testing policy and release-blocking gates.
- `docs/build-path-contract.md`: canonical build/test/release command contract.

Skills assets map:
- `skills/README.md`: skill asset packaging and prompt maintenance contract.
- `skills/PROMPT.md`: client-consumed single-file integration authoring prompt.
- `skills/integration-editor/SKILL.md`: canonical skill contract for AI-assisted integration YAML authoring.
- `skills/integration-editor/references/`: runtime-aligned references that must stay synchronized with config/flow/SDUI behavior.

Possible reading order example:
1. `docs/terminology.md`
2. The feature-area doc under `docs/flow/`, `docs/sdui/`, or `docs/frontend/`
3. `docs/testing_tdd.md` and `docs/build-path-contract.md` when deciding validation and command entrypoints

Before changing behavior, read the relevant docs under `docs/`.
After changing stable behavior or contracts, update the relevant docs in the same delivery.
`skills/` is not a development-doc source of truth; it is a product asset for embedded AI behavior. Update `skills/` when the related runtime/config authoring behavior changes.

## 5. Code Rules

- Split oversized modules proactively.
  - Function length target: <= 50 lines when practical.
  - File length target: <= 300 lines when practical.
- Any behavior change in core paths must include regression tests or updated tests.
- Follow `RED -> GREEN -> REFACTOR` for behavior changes when practical; keep the focused regression test in the same delivery.
- English is the primary language for the project. All code comments, error messages, logs, and documentation must be written in English.
- Keep comments concise and meaningful.
- Do not add placeholder logic for real execution paths.
- Keep frontend business logic out of view components when backend/API should own it.
- Follow i18n standards for user-facing copy:
  - Supported app languages are `en` and `zh`; default/fallback language is `en`.
  - Do not ship new hardcoded UI copy in pages/components; use translation keys from `ui-react/src/i18n/messages/*.ts`.
  - New translation keys must be added in both `en.ts` and `zh.ts` with the same key name.
  - Persist language preference through backend settings (`/api/settings`, `SystemSettings.language`), not ad-hoc frontend-only state.
  - For deterministic backend failures, define and keep stable standardized `error_code` values.
  - UI surfaces must preserve `error_code`-driven messaging/diagnostics; do not collapse to generic-only failure text.
- Dashboard management state rules:
  - `useViewTabsState` is the canonical owner for dashboard interaction state (`viewMode`, active/ordered ids, selected dashboard).
  - Keep SWR -> Zustand synchronization idempotent; do not add duplicate write paths in `Dashboard.tsx` effects.
  - Keep translation contracts stable for `dashboard.tabs.*` and `dashboard.management.*` keys.

## 6. Data Safety and Side-Effect Guardrails

- Treat local runtime data, secrets, OAuth credentials, migrations, scraper state, and destructive operations as high-risk.
- Prefer temporary or isolated data roots for manual verification. Avoid modifying existing user data under `GLANCEUS_DATA_DIR` unless the task explicitly requires it.
- Prefer mocks, fixtures, and local deterministic reproduction over real network/OAuth/external-account side effects whenever possible.
- Do not copy secrets, tokens, or raw credentials into tests, logs, screenshots, docs, prompts, or commits. Redact sensitive values in debugging artifacts and handoff notes.
- For migrations, cleanup flows, or destructive changes, prefer reversible paths and state the verification evidence that proves the change is safe.

## 7. Execution Boundaries and Decision Order

- Do not invent APIs, endpoints, config fields, or runtime capabilities.
- Do not add/remove/upgrade core dependencies without explicit approval.
- Use root `Makefile` entrypoints as the canonical path for dev/build/test/schema/cleanup operations; only drop to lower-level commands when the task specifically requires it.
- For high-impact changes (auth, executor, API contracts), report verification commands and outcomes.
- Keep changes scoped; avoid unrelated refactors in the same task.

Within repository-local guidance, resolve conflicts in this order:
1. Explicit user task and acceptance criteria.
2. This `AGENTS.md`.
3. Relevant docs/contracts under `docs/` and `skills/`.
4. Build/test/schema generation contracts and release gates.
5. Current implementation details.

If docs/contracts and implementation disagree, do not silently pick one. Read the relevant contract first, then either:
- bring code back into contract, or
- update the contract in the same delivery when the implementation is the new intended behavior.

## 8. Required Change Checklist

Before editing:
- Identify the impacted subsystem and read the relevant docs from Section 4 first.
- Decide whether the change affects runtime behavior, UI copy, schema/config contracts, or AI authoring assets.

During implementation:
- Keep behavior changes test-backed. Add or update focused regression coverage in the same delivery.
- UI changes must preserve i18n discipline: no new hardcoded user-facing copy; add matching keys to `ui-react/src/i18n/messages/en.ts` and `ui-react/src/i18n/messages/zh.ts`.
- Changes to step contracts, integration YAML shape, SDUI schema, widget/config behavior, or editor validation are not complete until the source contracts, generated schema artifacts under `config/schemas/`, and any impacted type/import surfaces are synchronized through `make gen-schemas` or updates to `scripts/generate_schemas.py`.
- Changes that affect AI-assisted integration authoring, config semantics, or important flow behavior must also update the `skills/` sources that describe or expose that behavior, including `skills/README.md`, `skills/PROMPT.md`, and the affected files under `skills/integration-editor/`.

Before handoff:
- Sync stable behavior changes back to the relevant docs, and sync `skills/` when embedded AI behavior or prompt-engineering assets are affected.
- Run the smallest relevant gate set from Section 10 plus any focused subsystem checks required by the touched contract.
- Report commands run, outcomes, regenerated artifacts, and any skipped checks with reasons.

## 9. Documentation Rules

- When architecture or command entrypoints change, sync relevant docs in the same delivery.
- `.planning/` is owned by GSD workflows. Do not manually change planning document structure or content unless explicitly requested through GSD operations.
- Keep dashboard management contracts synchronized in:
  - `docs/frontend/01_engineering_guide.md`
- Keep schema and AI authoring contracts synchronized when relevant behavior changes:
  - `docs/flow/02_step_reference.md`
  - `docs/sdui/`
  - `config/schemas/`
  - `skills/README.md`
  - `skills/PROMPT.md`
  - `skills/integration-editor/`
- Documentation authoring standard:
  - Prefer concept-first explanations (domain concepts, data flow, architecture boundaries, lifecycle).
  - Avoid over-coupling docs to concrete file paths, function names, or local variable names unless required for unambiguous contracts.
  - When implementation details are needed, describe stable interfaces/behaviors first, then add minimal code-location hints.
  - Keep terms consistent with `docs/terminology.md`.
  - Keep examples deterministic and aligned with current runtime behavior.

## 10. Minimum Validation Before Handoff

Run the smallest relevant gate set:
- Backend changes: `make test-backend`
- Frontend changes: `make test-frontend`
- TS-sensitive UI changes: `make test-typecheck`
- Mixed or broad changes: `make test-impacted`

Additional required actions by change type:
- Step/schema/config contract changes: `make gen-schemas`
- High-risk backend/auth/storage/executor changes: also follow focused checks from `docs/testing_tdd.md`

If a gate is skipped, explicitly state why.
