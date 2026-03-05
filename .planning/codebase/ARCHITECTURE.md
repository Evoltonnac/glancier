# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Configuration-driven modular monolith with a desktop shell

**Key Characteristics:**
- Integration behavior is declared in YAML (`config/integrations/*.yaml`) and resolved into runtime source configs by `core/config_loader.py`
- Backend is a single FastAPI service with injected shared services from `main.py` into module-level router state in `core/api.py`
- Frontend is a single React SPA (`ui-react/src/App.tsx`) with Tauri native bridge (`ui-react/src-tauri/src/lib.rs`) for desktop-only capabilities

## Layers

**Configuration Layer:**
- Purpose: Define integration/auth/request/flow metadata
- Location: `config/integrations/*.yaml`, `core/config_loader.py`
- Contains: Pydantic enums/models (`AuthType`, `StepType`, `SourceConfig`, `IntegrationConfig`)
- Depends on: `yaml`, `pydantic`
- Used by: `main.py`, `core/api.py`, `core/auth/manager.py`, `core/executor.py`

**Execution Layer:**
- Purpose: Execute flow steps, manage source runtime state, persist results
- Location: `core/executor.py`, `core/source_state.py`
- Contains: step runner (`http`, `oauth`, `extract`, `script`, `webview`), interaction exception mapping
- Depends on: `core/secrets_controller.py`, `core/data_controller.py`, `httpx`, `jsonpath_ng`
- Used by: `main.py` startup refresh and refresh APIs in `core/api.py`

**Persistence Layer:**
- Purpose: Store source/view config and runtime data locally
- Location: `core/resource_manager.py`, `core/data_controller.py`, `core/secrets_controller.py`, `core/settings_manager.py`
- Contains: JSON file CRUD + TinyDB latest/history tables + encrypted secrets support
- Depends on: local filesystem under `data/`
- Used by: API endpoints in `core/api.py`, executor in `core/executor.py`

**API Layer:**
- Purpose: Expose app capabilities to frontend/desktop client
- Location: `main.py`, `core/api.py`
- Contains: `/api/sources`, `/api/data`, `/api/refresh`, `/api/integrations/files`, `/api/settings`, OAuth and interaction endpoints
- Depends on: execution/persistence/config layers
- Used by: frontend API client `ui-react/src/api/client.ts`

**Presentation Layer:**
- Purpose: Render dashboard, integrations editor, settings, interaction dialogs
- Location: `ui-react/src/App.tsx`, `ui-react/src/pages/*.tsx`, `ui-react/src/components/**/*`
- Contains: GridStack dashboard, flow interaction UI, editor-driven integration management
- Depends on: API client `ui-react/src/api/client.ts`, design system primitives in `ui-react/src/components/ui/*`
- Used by: Browser runtime and Tauri window

**Desktop Bridge Layer:**
- Purpose: Provide native autostart and webview scraping workflows
- Location: `ui-react/src-tauri/src/lib.rs`, `ui-react/src-tauri/src/scraper.rs`
- Contains: tauri command handlers, event emitters, hidden/off-screen scraper window orchestration
- Depends on: Tauri plugins and frontend `invoke/listen` calls in `ui-react/src/App.tsx` and `ui-react/src/pages/Settings.tsx`
- Used by: React client when run as desktop app

## Data Flow

**User-Driven Refresh Flow:**

1. UI triggers refresh via `api.refreshSource` or `api.refreshAll` in `ui-react/src/api/client.ts`
2. FastAPI route in `core/api.py` resolves `StoredSource` to `SourceConfig` and schedules `Executor.fetch_source`
3. Executor runs configured steps in `core/executor.py`, obtaining secrets from `core/secrets_controller.py`
4. Results and status are persisted to TinyDB (`core/data_controller.py`) and returned to UI polling (`ui-react/src/App.tsx`)

**State Management:**
- Backend runtime state: in-memory `Executor._states` plus persisted source status in TinyDB via `DataController.set_state` (`core/executor.py`, `core/data_controller.py`)
- Frontend state: React hooks in large page-level component `ui-react/src/App.tsx`; no global state library detected

## Key Abstractions

**Source and Integration Models:**
- Purpose: Contract between YAML definitions, persisted JSON source instances, and runtime execution
- Examples: `core/config_loader.py`, `core/models.py`
- Pattern: Pydantic-validated schema with merge/substitution resolution

**InteractionRequest Contract:**
- Purpose: Standardize actionable user prompts (API key, OAuth, webview scrape)
- Examples: `core/source_state.py`, `ui-react/src/components/auth/FlowHandler.tsx`
- Pattern: backend emits typed interaction payload; frontend renders dynamic form/actions

**Scraper Task Bridge:**
- Purpose: Offload web dashboard scraping through Tauri webview interception
- Examples: `ui-react/src-tauri/src/scraper.rs`, `ui-react/src/App.tsx`
- Pattern: command dispatch (`invoke`) + emitted events (`listen`) + source-scoped dedupe

## Entry Points

**Backend Entry Point:**
- Location: `main.py`
- Triggers: `python main.py [port]`
- Responsibilities: initialize services, wire API dependencies, startup refresh lifecycle, run uvicorn

**Frontend Entry Point:**
- Location: `ui-react/src/main.tsx`
- Triggers: Vite app start (`npm run dev`)
- Responsibilities: mount React tree, apply `ThemeProvider`, render router app

**Desktop Entry Point:**
- Location: `ui-react/src-tauri/src/main.rs` -> `ui-react/src-tauri/src/lib.rs`
- Triggers: `npm run tauri:dev` / Tauri bundle launch
- Responsibilities: register native commands, optional sidecar startup, manage scraper state

## Error Handling

**Strategy:** Catch-and-convert with user-facing interactions or HTTP errors

**Patterns:**
- Backend uses `try/except` + `logger.error` and maps failures to `SourceStatus` + `InteractionRequest` in `core/executor.py`
- API routes validate presence/IDs and raise `HTTPException` in `core/api.py`

## Cross-Cutting Concerns

**Logging:** Python logging configured in `main.py`; module loggers throughout `core/*.py`; console logging on frontend in `ui-react/src/App.tsx`
**Validation:** Pydantic model validation in `core/config_loader.py`, `core/models.py`, `core/source_state.py`
**Authentication:** Source-scoped auth handlers (`api_key`, `oauth`, `browser`) in `core/auth/*.py` with secret persistence in `core/secrets_controller.py`

---

*Architecture analysis: 2026-02-28*
