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
- `ui-react/src/`: React UI, SDUI widgets, pages, state hooks
- `docs/`: architecture, flow, SDUI, testing, build contracts

## 4. Docs Onboarding and Directory Map

Use this section as the first-stop docs index for implementation and review tasks.

Recommended reading order:
1. `docs/terminology.md`: canonical domain language.
2. `docs/flow/01_architecture_and_orchestration.md`: flow model and execution boundary.
3. `docs/flow/02_step_reference.md`: step contracts for integration authoring.
4. `docs/sdui/01_architecture_and_guidelines.md`: SDUI rendering boundary and template model.
5. `docs/frontend/01_engineering_guide.md`: frontend reliability and state-management rules.
6. Topic-specific docs by feature area:
   - `docs/webview-scraper/`: desktop scraper architecture and runtime fallback.
   - `docs/flow/05_refresh_scheduler_and_retry.md`: retry/backoff and scheduler policy.
   - `docs/flow/06_storage_contract_and_migration.md`: storage boundary and migration lifecycle.
   - `docs/testing_tdd.md`: required test gates and TDD expectations.
   - `docs/build-path-contract.md`: build/release entrypoints and artifact ownership.
   - `docs/ui_design_guidelines.md`: UI visual/interaction rules.

Docs map (top-level + subdirectories):
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
- `docs/webview-scraper/01_architecture_and_dataflow.md`: scraper subsystem dataflow.
- `docs/webview-scraper/02_runtime_and_fallback.md`: runtime constraints and fallback behavior.
- `docs/frontend/01_engineering_guide.md`: frontend engineering rules and dashboard state contracts.
- `docs/ui_design_guidelines.md`: high-density UI principles and component-level guidance.
- `docs/testing_tdd.md`: testing policy and release-blocking gates.
- `docs/build-path-contract.md`: canonical build/test/release command contract.

When implementing or changing any related behavior, always consult the relevant docs first, and update those docs in the same delivery when behavior/contracts change so documentation stays current.

## 5. Code Rules

- Split oversized modules proactively.
  - Function length target: <= 50 lines when practical.
  - File length target: <= 300 lines when practical.
- Any behavior change in core paths must include regression tests or updated tests.
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

## 6. Execution Boundaries

- Do not invent APIs, endpoints, config fields, or runtime capabilities.
- Do not add/remove/upgrade core dependencies without explicit approval.
- For high-impact changes (auth, executor, API contracts), report verification commands and outcomes.
- Keep changes scoped; avoid unrelated refactors in the same task.

## 7. Documentation Rules

- When architecture or command entrypoints change, sync relevant docs in the same delivery.
- `.planning/` is owned by GSD workflows. Do not manually change planning document structure or content unless explicitly requested through GSD operations.
- Keep dashboard management contracts synchronized in:
  - `docs/frontend/01_engineering_guide.md`
- Documentation authoring standard:
  - Prefer concept-first explanations (domain concepts, data flow, architecture boundaries, lifecycle).
  - Avoid over-coupling docs to concrete file paths, function names, or local variable names unless required for unambiguous contracts.
  - When implementation details are needed, describe stable interfaces/behaviors first, then add minimal code-location hints.
  - Keep terms consistent with `docs/terminology.md`.
  - Keep examples deterministic and aligned with current runtime behavior.

## 8. Minimum Validation Before Handoff

Run the smallest relevant gate set:
- Backend changes: `make test-backend`
- Frontend changes: `make test-frontend`
- TS-sensitive UI changes: `make test-typecheck`
- Mixed or broad changes: `make test-impacted`

If a gate is skipped, explicitly state why.
