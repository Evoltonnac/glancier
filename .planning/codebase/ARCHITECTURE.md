# Architecture

**Analysis Date:** 2026-03-13

## Pattern Overview

**Overall:** Service-Oriented with Component-Based UI

**Key Characteristics:**
- FastAPI backend provides REST API for data fetching and source management
- React/TypeScript frontend with Zustand state management
- Flow-based execution engine for data source scraping
- YAML-driven integration and source configuration
- JSON-based persistent storage for runtime data and user configurations

## Layers

**Backend Layer (`core/`):**
- Purpose: Core business logic, data execution, and API serving
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/`
- Contains: API routes, executors, configuration loaders, data controllers
- Depends on: Pydantic, FastAPI, httpx, YAML libraries
- Used by: Frontend (via HTTP), Tauri desktop app

**API Layer (`core/api.py`):**
- Purpose: Expose REST endpoints for frontend consumption
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/api.py`
- Contains: FastAPI router with endpoints for sources, views, integrations, auth
- Depends on: All core modules (executor, data_controller, config, auth_manager)
- Used by: Frontend HTTP client (`ui-react/src/api/client.ts`)

**Execution Layer (`core/executor.py`):**
- Purpose: Orchestrate data source fetching via flow steps
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/executor.py`
- Contains: Executor class that runs flows, manages SourceState
- Depends on: Steps (http_step, auth_step, browser_step, etc.), SecretsController
- Used by: API layer for fetch operations

**Step Modules (`core/steps/`):**
- Purpose: Implement individual flow step types
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/steps/`
- Contains: `http_step.py`, `auth_step.py`, `browser_step.py`, `extract_step.py`, `script_step.py`
- Depends on: httpx, browser automation, auth libraries
- Used by: Executor

**Data Persistence Layer:**
- Purpose: JSON-based storage for sources, views, and scraped data
- Locations:
  - `/Users/xingminghua/Coding/evoltonnac/glancier/core/data_controller.py` - scraped data
  - `/Users/xingminghua/Coding/evoltonnac/glancier/core/resource_manager.py` - sources/views metadata
  - `/Users/xingminghua/Coding/evoltonnac/glancier/core/secrets_controller.py` - encrypted credentials

**Configuration Layer (`core/config_loader.py`):**
- Purpose: Parse and resolve YAML integration/source configs
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/config_loader.py`
- Contains: Pydantic models, YAML loading, variable substitution, integration inheritance
- Depends on: PyYAML, Pydantic
- Used by: Executor, API, bootstrap

**Authentication Layer (`core/auth/`):**
- Purpose: Handle OAuth, API key, and PKCE authentication flows
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/auth/`
- Contains: `oauth_auth.py`, `pkce.py`, `manager.py`, `oauth_types.py`
- Depends on: authlib, cryptography
- Used by: Executor (auth steps), API (auth endpoints)

**Frontend Layer (`ui-react/src/`):**
- Purpose: React-based UI with Tauri desktop integration
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/`
- Contains: Pages, components, store, API client, widget renderer
- Depends on: React 18, Zustand, Monaco Editor, GridStack, Radix UI
- Used by: End users via browser or Tauri desktop

## Data Flow

**Source Fetch Flow:**

1. Frontend calls `POST /api/sources/{id}/fetch` via `api/client.ts`
2. API endpoint retrieves SourceConfig via `resolve_stored_source()` in `main.py`
3. API calls `executor.fetch_source(source)`
4. Executor runs flow steps sequentially:
   - Resolves step arguments (outputs > context > secrets)
   - Dispatches to appropriate step handler (`execute_http_step`, `execute_auth_step`, etc.)
   - Stores outputs to context and secrets
5. Executor persists result via `data_controller.upsert()`
6. Executor updates SourceState via `data_controller.set_state()`
7. Frontend polls for state changes and refreshes data display

**Authentication Flow:**

1. Source fetch fails with auth error (401/403)
2. Executor raises `RequiredSecretMissing` or `InvalidCredentialsError`
3. Executor converts exception to `InteractionRequest`
4. State persisted with `SUSPENDED` status and interaction data
5. Frontend detects suspended source, shows auth modal (OAuth, API key input, etc.)
6. User completes auth, frontend calls interaction resolution endpoint
7. Secrets stored via `secrets_controller`
8. Frontend retries fetch

**Configuration Resolution Flow:**

1. `main.py` calls `load_config()` from `config_loader.py`
2. Loader scans `config/` directory for YAML files
3. Integrations loaded from `config/integrations/*.yaml`
4. Sources loaded from `config/sources.yaml` or `config/*.yaml`
5. Variable substitution applies `{var}` placeholders
6. Integration inheritance resolved (source inherits from integration)
7. Pydantic validation ensures schema compliance

## Key Abstractions

**SourceConfig:**
- Purpose: Runtime representation of a data source with resolved flow
- Examples: `/Users/xingminghua/Coding/evoltonnac/glancier/core/config_loader.py` (SourceConfig model)
- Pattern: Pydantic BaseModel with flow, vars, schedule

**StoredSource:**
- Purpose: User-persisted source metadata (ID, integration_id, vars, config)
- Examples: `/Users/xingminghua/Coding/evoltonnac/glancier/core/models.py`
- Pattern: JSON-serializable Pydantic model

**StepConfig:**
- Purpose: Single step in a flow (HTTP request, auth, extraction, etc.)
- Examples: `/Users/xingminghua/Coding/evoltonnac/glancier/core/config_loader.py` (StepConfig model)
- Pattern: Defines `id`, `use` (step type), `args`, `outputs`, `context`, `secrets`

**SourceState:**
- Purpose: Runtime state of a source (ACTIVE, ERROR, SUSPENDED, etc.)
- Examples: `/Users/xingminghua/Coding/evoltonnac/glancier/core/source_state.py`
- Pattern: Enum status + interaction request for suspended state

**InteractionRequest:**
- Purpose: Frontend instruction for user action (OAuth, API key input, retry)
- Examples: `/Users/xingminghua/Coding/evoltonnac/glancier/core/source_state.py`
- Pattern: Enum type + fields + data payload

## Entry Points

**Backend Entry:**
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/main.py`
- Triggers: `python main.py [port]` or `uvicorn main:app`
- Responsibilities: FastAPI app creation, component initialization, CORS setup, lifespan management

**Frontend Entry:**
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/main.tsx`
- Triggers: `npm run dev` (Vite dev server) or Tauri build
- Responsibilities: React app mount, routing setup, store initialization

**API Router:**
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/api.py`
- Triggers: HTTP requests from frontend
- Responsibilities: All REST endpoints (sources, views, integrations, auth, settings)

**Executor Entry:**
- Location: `/Users/xingminghua/Coding/evoltonnac/glancier/core/executor.py` (Executor.fetch_source)
- Triggers: API source fetch endpoint
- Responsibilities: Flow execution, state management, error handling

## Error Handling

**Strategy:** Exception-based with structured interaction requests

**Patterns:**
- Custom exceptions: `RequiredSecretMissing`, `InvalidCredentialsError`, `WebScraperBlockedError`, `FlowExecutionError`
- Executor catches exceptions and converts to InteractionRequest for frontend
- State persisted to JSON for frontend polling
- OAuth refresh attempt on credential failure before showing interaction

## Cross-Cutting Concerns

**Logging:** Python standard logging module with configurable levels (DEBUG/INFO)

**Validation:** Pydantic models throughout config loading and API request/response

**Authentication:**
- OAuth 1.0a/2.0 with PKCE support
- API key header injection
- cURL command parsing
- Browser cookie extraction

**Encryption:**
- SecretsController with cryptography for stored credentials
- SettingsManager for adaptive encryption

---

*Architecture analysis: 2026-03-13*
