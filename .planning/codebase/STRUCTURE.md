# Codebase Structure

**Analysis Date:** 2026-03-13

## Directory Layout

```
glancier/                          # Project root
├── main.py                        # Backend entry point (FastAPI)
├── requirements.txt               # Python dependencies
├── config/                       # YAML configuration files
│   ├── integrations/             # Integration YAML definitions
│   ├── presets/                  # Reusable auth/flow presets
│   ├── examples/                 # Example sources/views
│   └── schemas/                  # JSON schemas for validation
├── core/                         # Backend source code
│   ├── api.py                    # FastAPI routes
│   ├── executor.py               # Flow execution engine
│   ├── config_loader.py           # YAML config parsing
│   ├── data_controller.py         # JSON data persistence
│   ├── resource_manager.py       # Sources/views storage
│   ├── secrets_controller.py     # Encrypted credentials
│   ├── models.py                 # Pydantic data models
│   ├── source_state.py            # Runtime state definitions
│   ├── settings_manager.py       # App settings
│   ├── parser.py                  # YAML/content parser
│   ├── bootstrap.py               # First-launch seeding
│   ├── encryption.py              # Encryption utilities
│   ├── auth/                      # Authentication modules
│   │   ├── manager.py
│   │   ├── oauth_auth.py
│   │   ├── oauth_types.py
│   │   └── pkce.py
│   └── steps/                     # Flow step implementations
│       ├── __init__.py
│       ├── http_step.py
│       ├── auth_step.py
│       ├── browser_step.py
│       ├── extract_step.py
│       └── script_step.py
├── ui-react/                     # Frontend React application
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx              # Frontend entry point
│   │   ├── App.tsx               # Root component
│   │   ├── api/
│   │   │   └── client.ts         # API HTTP client
│   │   ├── store/
│   │   │   └── index.ts          # Zustand state store
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Integrations.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── dashboardLayout.ts
│   │   ├── components/
│   │   │   ├── widgets/           # Widget renderer system
│   │   │   │   ├── WidgetRenderer.tsx
│   │   │   │   ├── elements/     # Widget element components
│   │   │   │   ├── layouts/      # Widget layout components
│   │   │   │   ├── containers/   # Widget container components
│   │   │   │   ├── actions/     # Widget action components
│   │   │   │   └── visualizations/
│   │   │   ├── ui/              # Radix UI primitives
│   │   │   ├── auth/            # OAuth/auth flow components
│   │   │   ├── TopNav.tsx
│   │   │   ├── AppHeader.tsx
│   │   │   └── ...
│   │   ├── hooks/                # Custom React hooks
│   │   ├── lib/                 # Utilities
│   │   ├── types/               # TypeScript types
│   │   ├── workers/             # Web workers
│   │   └── test/                # Test utilities
│   └── tests/                    # Frontend tests
├── scripts/                      # Build/dev scripts
├── tests/                       # Backend pytest tests
├── data/                        # Runtime data (generated)
│   ├── data.json                # Scraped data
│   ├── sources.json             # User sources
│   ├── views.json               # User views
│   └── settings.json            # App settings
└── docs/                        # Documentation
```

## Directory Purposes

**`/Users/xingminghua/Coding/evoltonnac/glancier/core/`:**
- Purpose: All backend Python code
- Contains: API routes, executors, controllers, models, steps, auth
- Key files: `main.py`, `api.py`, `executor.py`, `config_loader.py`, `data_controller.py`

**`/Users/xingminghua/Coding/evoltonnac/glancier/core/steps/`:**
- Purpose: Flow step implementations
- Contains: HTTP requests, authentication, browser automation, extraction, scripting
- Key files: `http_step.py`, `auth_step.py`, `browser_step.py`, `extract_step.py`, `script_step.py`

**`/Users/xingminghua/Coding/evoltonnac/glancier/core/auth/`:**
- Purpose: Authentication and credential handling
- Contains: OAuth flows, PKCE, credential management
- Key files: `manager.py`, `oauth_auth.py`, `pkce.py`, `oauth_types.py`

**`/Users/xingminghua/Coding/evoltonnac/glancier/config/`:**
- Purpose: YAML configuration files
- Contains: Integration definitions, source configs, view templates, presets
- Key files: `integrations/*.yaml`, `presets/*.yaml`, `examples/*.yaml`

**`/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/`:**
- Purpose: React frontend source code
- Contains: Pages, components, store, API client, hooks, types
- Key files: `main.tsx`, `App.tsx`, `store/index.ts`, `api/client.ts`

**`/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/components/widgets/`:**
- Purpose: Widget rendering system for data visualization
- Contains: WidgetRenderer, elements (TextBlock, Badge, Image, etc.), layouts, actions
- Key files: `WidgetRenderer.tsx`, `elements/*.tsx`, `layouts/*.tsx`

**`/Users/xingminghua/Coding/evoltonnac/glancier/tests/`:**
- Purpose: Backend pytest tests
- Contains: Unit and integration tests
- Key files: `conftest.py`, `test_*.py`

## Key File Locations

**Entry Points:**
- `/Users/xingminghua/Coding/evoltonnac/glancier/main.py` - Backend (FastAPI app factory)
- `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/main.tsx` - Frontend (React mount)

**Configuration:**
- `/Users/xingminghua/Coding/evoltonnac/glancier/core/config_loader.py` - YAML loading and resolution
- `/Users/xingminghua/Coding/evoltonnac/glancier/config/` - Integration and source YAML files

**Core Logic:**
- `/Users/xingminghua/Coding/evoltonnac/glancier/core/api.py` - REST API endpoints
- `/Users/xingminghua/Coding/evoltonnac/glancier/core/executor.py` - Flow execution engine
- `/Users/xingminghua/Coding/evoltonnac/glancier/core/data_controller.py` - Scraped data storage
- `/Users/xingminghua/Coding/evoltonnac/glancier/core/resource_manager.py` - Sources/views management

**State Management:**
- `/Users/xingminghua/Coding/evoltonnac/glancier/core/source_state.py` - SourceStatus, InteractionRequest
- `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/store/index.ts` - Zustand store

**Testing:**
- `/Users/xingminghua/Coding/evoltonnac/glancier/tests/conftest.py` - Pytest fixtures
- `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/test/setup.ts` - Vitest setup
- `/Users/xingminghua/Coding/evoltonnac/glancier/pytest.ini` - Pytest config

## Naming Conventions

**Python Files:**
- snake_case: `config_loader.py`, `data_controller.py`, `source_state.py`
- Module prefix for related files: `auth_step.py`, `http_step.py` (in `steps/`)

**TypeScript Files:**
- PascalCase: `Dashboard.tsx`, `WidgetRenderer.tsx`, `OAuthCallback.tsx`
- camelCase: `useScraper.ts`, `useSidebar.ts`, `apiClient.ts`

**Directories:**
- snake_case for Python: `core/auth/`, `core/steps/`
- kebab-case for React: `ui-react/src/components/widgets/`, `ui-react/src/pages/`

**Models/Classes:**
- PascalCase: `SourceConfig`, `StoredSource`, `Executor`, `DataController`
- Enum values: UPPER_SNAKE_CASE for Python enums, camelCase for TypeScript

**Configuration IDs:**
- kebab-case: `github`, `openrouter_tools`, `gold_price_market`

## Where to Add New Code

**New Integration:**
- Configuration: `/Users/xingminghua/Coding/evoltonnac/glancier/config/integrations/{id}.yaml`
- Test data: `/Users/xingminghua/Coding/evoltonnac/glancier/config/examples/integrations/{id}.yaml`

**New Flow Step:**
- Implementation: `/Users/xingminghua/Coding/evoltonnac/glancier/core/steps/{step_type}_step.py`
- Register in: `/Users/xingminghua/Coding/evoltonnac/glancier/core/steps/__init__.py`
- Add StepType enum: `/Users/xingminghua/Coding/evoltonnac/glancier/core/config_loader.py`

**New API Endpoint:**
- Implementation: `/Users/xingminghua/Coding/evoltonnac/glancier/core/api.py` (add to router)
- Depends on: Import from core modules and inject via `api.init_api()`

**New Frontend Page:**
- Implementation: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/pages/{PageName}.tsx`
- Routing: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/App.tsx`

**New Widget Type:**
- Implementation: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/components/widgets/{category}/{WidgetName}.tsx`
- Register in: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/components/widgets/WidgetRenderer.tsx`

**New State (Frontend):**
- Add to: `/Users/xingminghua/Coding/evoltonnac/glancier/ui-react/src/store/index.ts` (Zustand store)

## Special Directories

**`.planning/`:**
- Purpose: GSD planning documents
- Generated: Yes (by this analysis)
- Committed: Yes (committed to git for planner/executor consumption)

**`data/`:**
- Purpose: Runtime data storage (JSON files)
- Generated: Yes (created at runtime)
- Committed: No (in .gitignore)

**`build/` / `dist/`:**
- Purpose: Build outputs
- Generated: Yes
- Committed: No

**`.venv/`:**
- Purpose: Python virtual environment
- Generated: Yes
- Committed: No

**`ui-react/node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-13*
