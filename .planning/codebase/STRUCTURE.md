# Codebase Structure

**Analysis Date:** 2026-02-28

## Directory Layout

```
quota-board/
├── main.py                  # FastAPI application entrypoint and dependency wiring
├── core/                    # Backend domain/services (API, executor, auth, storage)
├── config/                  # YAML integration definitions
├── data/                    # Local runtime data files (sources/views/data/secrets/settings)
├── scripts/                 # Dev and build orchestration scripts
├── tests/                   # Ad-hoc backend verification scripts
├── ui-react/                # React + Vite frontend and Tauri shell
├── docs/                    # Architecture and workflow documentation
└── .planning/codebase/      # Generated codebase mapping docs
```

## Directory Purposes

**`core/`:**
- Purpose: Backend implementation and business logic
- Contains: FastAPI router, execution engine, auth strategies, config/schema models, persistence adapters
- Key files: `core/api.py`, `core/executor.py`, `core/config_loader.py`, `core/data_controller.py`

**`core/auth/`:**
- Purpose: Authentication strategy modules
- Contains: OAuth handler, browser cookie auth, API-key auth, manager
- Key files: `core/auth/manager.py`, `core/auth/oauth_auth.py`

**`config/integrations/`:**
- Purpose: Integration definitions and templates
- Contains: provider YAMLs and flow definitions
- Key files: `config/integrations/openrouter_quota.yaml`, `config/integrations/soniox_quota.yaml`

**`ui-react/src/`:**
- Purpose: Frontend UI and client logic
- Contains: app routes/pages, API client, reusable components, styles, type contracts
- Key files: `ui-react/src/App.tsx`, `ui-react/src/api/client.ts`, `ui-react/src/pages/Integrations.tsx`

**`ui-react/src-tauri/`:**
- Purpose: Desktop shell and native command bridge
- Contains: Rust command handlers, scraper window orchestration, Tauri config
- Key files: `ui-react/src-tauri/src/lib.rs`, `ui-react/src-tauri/src/scraper.rs`, `ui-react/src-tauri/tauri.conf.json`

**`scripts/`:**
- Purpose: Developer workflows and packaging
- Contains: backend file-watch restart script, sidecar build script
- Key files: `scripts/dev_server.py`, `scripts/build.sh`

## Key File Locations

**Entry Points:**
- `main.py`: backend app bootstrap and server launch
- `ui-react/src/main.tsx`: React root render
- `ui-react/src-tauri/src/main.rs`: Tauri process entrypoint

**Configuration:**
- `requirements.txt`: Python dependencies
- `ui-react/package.json`: frontend dependencies/scripts
- `ui-react/vite.config.ts`: dev server + `/api` proxy settings
- `ui-react/src-tauri/Cargo.toml`: Rust/Tauri dependencies

**Core Logic:**
- `core/executor.py`: flow step engine and runtime state transitions
- `core/api.py`: REST endpoints and integration settings management
- `core/config_loader.py`: YAML merge/resolve and schema validation

**Testing:**
- `tests/verify_interactions.py`: manual async interaction behavior checks
- `ui-react/src-tauri/src/scraper_test.rs`: small builder smoke helper (not wired to cargo test)

## Naming Conventions

**Files:**
- Python modules use `snake_case.py` (example: `core/settings_manager.py`)
- React components use `PascalCase.tsx` for app-level components (example: `ui-react/src/components/BaseSourceCard.tsx`)
- UI primitive files use lowercase/kebab-style names (example: `ui-react/src/components/ui/dropdown-menu.tsx`)

**Directories:**
- Feature/domain grouping (`core/auth`, `ui-react/src/pages`, `ui-react/src/components/widgets`)

## Where to Add New Code

**New Feature:**
- Primary code: backend behavior in `core/` and frontend screens in `ui-react/src/pages` or `ui-react/src/components`
- Tests: currently `tests/` for backend scripts; no established frontend test directory detected

**New Component/Module:**
- Implementation: UI primitives in `ui-react/src/components/ui/`; feature components in `ui-react/src/components/`

**Utilities:**
- Shared helpers: `ui-react/src/lib/utils.ts` (frontend), new backend utility modules under `core/` by domain

## Special Directories

**`data/`:**
- Purpose: runtime app state and secrets
- Generated: Yes
- Committed: No by default (`data/*.json` ignored in `.gitignore`)

**`ui-react/src-tauri/target/`:**
- Purpose: Rust build artifacts
- Generated: Yes
- Committed: No by default (`ui-react/src-tauri/target/` ignored in `.gitignore`)

**`.agents/` and `.agent/`:**
- Purpose: local agent/skill metadata
- Generated: Depends on tooling
- Committed: No by default (`.agent/`, `.agents/` ignored in `.gitignore`)

---

*Structure analysis: 2026-02-28*
