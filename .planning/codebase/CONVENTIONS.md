# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

**Files:**
- Backend Python uses `snake_case` file naming (examples: `core/data_controller.py`, `core/source_state.py`)
- Frontend feature components mostly use `PascalCase` (examples: `ui-react/src/components/BaseSourceCard.tsx`, `ui-react/src/pages/Settings.tsx`)
- Frontend UI primitives use lowercase names, sometimes kebab-case (examples: `ui-react/src/components/ui/button.tsx`, `ui-react/src/components/ui/dropdown-menu.tsx`)

**Functions:**
- Python uses `snake_case` functions/methods (examples: `resolve_stored_source` in `main.py`, `_resolve_args` in `core/executor.py`)
- TypeScript uses `camelCase` functions/hooks (examples: `handleAddWidget` and `loadData` in `ui-react/src/App.tsx`)

**Variables:**
- Python follows `snake_case` (`stored_sources` in `core/api.py`)
- TS/React follows `camelCase` (`activeScraperRef` in `ui-react/src/App.tsx`)

**Types:**
- Pydantic models use `PascalCase` in backend (`SourceConfig` in `core/config_loader.py`)
- TS interfaces/types use `PascalCase` (`SourceSummary` in `ui-react/src/types/config.ts`)

## Code Style

**Formatting:**
- Python formatter config not detected (`pyproject.toml`/`ruff`/`black` config absent)
- Frontend formatting appears Prettier-like but Prettier config not detected

**Linting:**
- ESLint flat config with TypeScript and React plugins in `ui-react/eslint.config.js`
- Strict TS compiler settings (`strict`, `noUnusedLocals`, `noUnusedParameters`) in `ui-react/tsconfig.json`

## Import Organization

**Order:**
1. External libraries first (example: `react`, `@tauri-apps/api`, `gridstack` in `ui-react/src/App.tsx`)
2. Local modules/components second (example: `./api/client`, `./components/*` in `ui-react/src/App.tsx`)
3. Type imports and value imports are mixed but explicit where needed (example: `type` imports in `ui-react/src/App.tsx`)

**Path Aliases:**
- `@` alias to `ui-react/src` configured in `ui-react/vite.config.ts`
- Relative imports still dominant across UI code (example: `../../lib/utils` in `ui-react/src/components/ui/button.tsx`)

## Error Handling

**Patterns:**
- API layer raises `HTTPException` for invalid resources/state in `core/api.py`
- Service layer catches and logs exceptions, then updates runtime state in `core/executor.py`
- Frontend API client throws on non-2xx and callers catch with UI fallback/console logging in `ui-react/src/api/client.ts` and `ui-react/src/App.tsx`

## Logging

**Framework:** Python `logging`; frontend `console`; Tauri plugin log in debug

**Patterns:**
- Module logger usage (`logger = logging.getLogger(__name__)`) in `main.py`, `core/*.py`
- User-facing UI errors handled with `alert` or local state in `ui-react/src/pages/Settings.tsx` and `ui-react/src/pages/Integrations.tsx`

## Comments

**When to Comment:**
- Comments are used for rationale and operational caveats (examples: GridStack sync notes in `ui-react/src/App.tsx`, encryption migration comments in `core/secrets_controller.py`)

**JSDoc/TSDoc:**
- Sparse and selective on frontend (example comments on row-span behavior in `ui-react/src/types/config.ts`)
- Python docstrings are widely used for modules/classes/functions in `core/*.py`

## Function Design

**Size:**
- Several large functions/components exceed small-function norms (notably `Dashboard` in `ui-react/src/App.tsx` and long route module in `core/api.py`)

**Parameters:**
- Backend passes explicit dependency objects during initialization (`api.init_api(...)` in `main.py`)
- Frontend handlers frequently close over page state rather than receiving narrow dependencies (`ui-react/src/App.tsx`)

**Return Values:**
- Backend service methods return typed dict/model structures (examples in `core/data_controller.py`, `core/resource_manager.py`)
- Frontend API client methods return parsed JSON promises with simple typed interfaces in `ui-react/src/api/client.ts`

## Module Design

**Exports:**
- Backend modules export classes/functions directly by definition (no central barrel module)
- Frontend uses named exports for components/utilities and occasional default exports for page components (`ui-react/src/pages/Integrations.tsx`)

**Barrel Files:**
- Barrel export used for UI components in `ui-react/src/components/index.ts`
- Most feature areas import directly from file paths instead of barrels

---

*Convention analysis: 2026-02-28*
