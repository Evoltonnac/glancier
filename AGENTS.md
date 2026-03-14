# AGENTS.md — AI Engineering Contract for Glancier

This document defines the minimum required behavior for AI agents working in this repository.

## 1. Project Purpose and Product Goal

Glancier is a config-first personal data hub.

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
- Local JSON/TinyDB storage under `GLANCIER_DATA_DIR`
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

## 4. Code Rules

- Split oversized modules proactively.
  - Function length target: <= 50 lines when practical.
  - File length target: <= 300 lines when practical.
- Any behavior change in core paths must include regression tests or updated tests.
- Keep comments concise and meaningful; use English for code comments.
- Do not add placeholder logic for real execution paths.
- Keep frontend business logic out of view components when backend/API should own it.

## 5. Execution Boundaries

- Do not invent APIs, endpoints, config fields, or runtime capabilities.
- Do not add/remove/upgrade core dependencies without explicit approval.
- For high-impact changes (auth, executor, API contracts), report verification commands and outcomes.
- Keep changes scoped; avoid unrelated refactors in the same task.

## 6. Documentation Rules

- Documents without an explicit language requirement must be written in English.
- This rule includes `README.md` and `AGENTS.md`.
- When architecture or command entrypoints change, sync relevant docs in the same delivery.
- `.planning/` is owned by GSD workflows. Do not manually change planning document structure or content unless explicitly requested through GSD operations.

## 7. Minimum Validation Before Handoff

Run the smallest relevant gate set:
- Backend changes: `make test-backend`
- Frontend changes: `make test-frontend`
- TS-sensitive UI changes: `make test-typecheck`
- Mixed or broad changes: `make test-impacted`

If a gate is skipped, explicitly state why.
