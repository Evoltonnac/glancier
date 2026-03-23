# Architecture Research

**Domain:** Glanceus v1.2 architecture extension for SQL database steps and chart widgets  
**Researched:** 2026-03-23  
**Confidence:** MEDIUM-HIGH (HIGH for current integration seams, MEDIUM for connector rollout details)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 Config Authoring + Validation Layer                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  Integration YAML  →  core/config_loader.py  →  scripts/generate_schemas   │
│     (flow/templates)       (StepType/args)         (Python + SDUI schema)  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Backend Execution Layer                                │
├──────────────────────────────────────────────────────────────────────────────┤
│  core/executor.py                                                           │
│    ├─ existing auth/http/extract/script/webview steps                       │
│    └─ NEW sql step adapter (core/steps/sql_step.py)                         │
│         ├─ connector strategy (postgres/mysql/sqlite)                       │
│         ├─ timeout/row-limit/read-only guardrails                           │
│         └─ normalized result envelope (rows/columns/row_count/query_ms)     │
│                                                                              │
│  persistence: DataController (runtime_latest/runtime_history),              │
│  SecretsController (encrypted credentials), SourceState (status/error_code) │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      API + Frontend SDUI Layer                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  /api/data/{source_id}  →  Dashboard/BaseSourceCard  →  WidgetRenderer      │
│                                          ├─ existing widgets                │
│                                          └─ NEW chart widgets (Recharts)    │
│  NOTE: Frontend only renders Integration Data; no DB connection ownership.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `core/config_loader.py` | Flow/template contract parsing and validation | Extend `StepType` with `sql` and add strict SQL args schema |
| `core/executor.py` | Step orchestration, variable resolution, state/error updates | Add SQL dispatch branch and deterministic SQL error classification |
| `core/steps/sql_step.py` (new) | Execute SQL query with connector-specific driver strategy | Normalize results into JSON-safe envelope for output mapping |
| `core/secrets_controller.py` | Persistent encrypted credentials | Reuse for DSN/password/SSL material; never expose through `outputs` |
| `ui-react/src/components/widgets/WidgetRenderer.tsx` | Runtime SDUI validation + recursive rendering | Register chart widget schemas/components in discriminated union |
| `ui-react/src/components/widgets/visualizations/*` | Visualization primitives | Add chart components with graceful fallback on invalid/missing series |
| `scripts/generate_schemas.py` + `generate_react_sdui_schema.mjs` | Compose backend + frontend schema for Monaco | Include SQL step schema + chart widget refs in generated schema |

## Recommended Project Structure

```
core/
├── config_loader.py                 # MOD: StepType.sql + SQL args schema
├── executor.py                      # MOD: SQL dispatch + error handling
└── steps/
    ├── __init__.py                  # MOD: export SQL step executor
    └── sql_step.py                  # NEW: connector strategy + query execution

ui-react/src/
├── components/widgets/
│   ├── WidgetRenderer.tsx           # MOD: schema union + switch cases
│   └── visualizations/
│       ├── ChartLine.tsx            # NEW: line-series rendering
│       ├── ChartBar.tsx             # NEW: bar-series rendering
│       └── chartShared.ts           # NEW: shared chart data coercion guards
├── types/config.ts                  # MOD: SDUI widget unions + StepType.sql
└── i18n/messages/{en,zh}.ts         # MOD: chart/SQL error_code messaging

scripts/
└── generate_react_sdui_schema.mjs   # MOD: include new chart widgets in defs

docs/
├── flow/02_step_reference.md        # MOD: SQL step contract
├── sdui/01_architecture_and_guidelines.md
├── sdui/02_component_map_and_categories.md
└── frontend/01_engineering_guide.md # MOD: chart widget rendering constraints
```

### Structure Rationale

- **`core/steps/sql_step.py` as a separate step module:** keeps SQL logic isolated from executor orchestration and aligned with existing step-handler architecture.
- **`visualizations/` for chart widgets:** preserves SDUI component taxonomy and keeps chart rendering concerns out of page-level/dashboard orchestration.
- **Schema generation as contract gate:** editor validation and runtime parsing stay synchronized; no hidden frontend-only or backend-only contract drift.

## Architectural Patterns

### Pattern 1: Connector Strategy Inside One `sql` Step Type

**What:** Keep one flow step type (`use: sql`) and switch connector implementation via `args.driver` instead of adding separate step types per database.  
**When to use:** Need multiple SQL backends while preserving one orchestration path.  
**Trade-offs:** Cleaner flow semantics and lower executor complexity, but connector-specific options must be normalized carefully.

**Example:**
```python
async def execute_sql_step(step, source, args, context, outputs, executor):
    driver = args["driver"]  # "postgres" | "mysql" | "sqlite"
    query = args["query"]
    conn = resolve_connection(args, executor, source.id)
    rows, columns, elapsed_ms = await CONNECTOR_BY_DRIVER[driver].run(
        conn=conn,
        query=query,
        params=args.get("params", {}),
        timeout_seconds=args.get("timeout_seconds", 10),
        max_rows=args.get("max_rows", 500),
    )
    return {
        "rows": rows,
        "columns": columns,
        "row_count": len(rows),
        "query_ms": elapsed_ms,
    }
```

### Pattern 2: Output-Normalization Boundary Between SQL and SDUI

**What:** SQL step emits JSON-safe Integration Data envelope; chart widgets consume normalized arrays and scalar Metrics/Signals via template bindings.  
**When to use:** Any query result that must be reused by multiple widgets or downstream script/extract steps.  
**Trade-offs:** Slightly more backend transform work, but frontend remains declarative and predictable.

**Example:**
```yaml
- id: query_usage
  use: sql
  args:
    driver: "postgres"
    dsn: "{db_dsn}"
    query: |
      SELECT day, used_credits
      FROM usage_daily
      ORDER BY day ASC
    max_rows: 120
    timeout_seconds: 8
  outputs:
    usage_rows: "rows"
    usage_count: "row_count"
```

### Pattern 3: Schema-First Dual Validation (Python + Zod)

**What:** Add contracts in `core/config_loader.py` and widget Zod schemas, then regenerate `config/schemas/integration.schema.json`.  
**When to use:** Every new step/widget capability.  
**Trade-offs:** Requires discipline (`make gen-schemas` + tests) but prevents runtime/editor divergence.

## Data Flow

### Request Flow (SQL + Chart End-to-End)

```
[Refresh scheduler / manual refresh]
    ↓
[Executor._run_flow]
    ↓
[sql step: connect + query + normalize]
    ↓
[step outputs/context/secrets mapping]
    ↓
[DataController.upsert Integration Data]
    ↓
[/api/data/{source_id}]
    ↓
[SWR useSourceData + Dashboard]
    ↓
[BaseSourceCard -> WidgetRenderer]
    ↓
[Chart widgets render series/axes/legends]
```

### State Management

```
[Backend SourceState + runtime_latest]
    ↓ (poll/fetch)
[SWR cache]
    ↓ (derived sync)
[Dashboard + useViewTabsState]
    ↓
[WidgetRenderer runtime validation + fallback]
```

### Key Data Flows

1. **SQL to Integration Data:** query result is normalized in backend and persisted as Integration Data; only mapped `outputs` become long-lived data for Bento Card rendering.
2. **Integration Data to Chart Widget:** frontend resolves template expressions against `sourceData.data`; chart widget receives already-shaped data and renders without business-side fetching.

## Config Contracts (Recommended)

### Flow Step Contract: `use: sql`

```yaml
- id: query_step
  use: sql
  args:
    driver: "postgres"          # required: postgres | mysql | sqlite
    dsn: "{db_dsn}"             # required for postgres/mysql
    database_path: "{db_path}"  # required for sqlite
    query: "SELECT ..."
    params: { limit: 50 }       # optional named params
    timeout_seconds: 10         # optional
    max_rows: 500               # optional, hard upper bound enforced
    read_only: true             # recommended default true
  outputs:
    rows: "rows"
    row_count: "row_count"
```

### Chart Widget Contract (SDUI)

Recommended to add widget types as visualizations (for example `ChartLine`, `ChartBar`) with a shared data contract:

```yaml
- type: "ChartLine"
  data_source: "{usage_rows}"     # array of objects
  x_field: "day"                  # string/date-like field
  y_field: "used_credits"         # numeric field
  height: 180
  tone: "info"
  show_grid: true
```

Contract boundary:
- Chart widgets only read resolved template data.
- Data shape coercion/guarding happens inside widget schema/component.
- Query semantics and heavy transformations stay in flow (`sql` + `script`).

## Execution Boundaries

- **Backend owns:** DB connectivity, query execution, timeout/row-limit controls, SQL error classification, Integration Data normalization, secret handling.
- **Frontend owns:** SDUI runtime validation and rendering of normalized Integration Data into chart widgets.
- **Config owns:** connector choice, query text, output mappings, and widget composition.
- **Forbidden boundary crossing:** no frontend direct DB access, no query execution inside widgets, no credential persistence in `outputs`/`context`.

## New vs Modified Components (Explicit)

| Area | Component | New vs Modified | Reason |
|------|-----------|-----------------|--------|
| Backend flow contracts | `core/config_loader.py` | Modified | Add `StepType.sql` and SQL args schema |
| Backend step runtime | `core/steps/sql_step.py` | New | Encapsulate connector + query execution |
| Backend orchestrator | `core/executor.py` | Modified | Dispatch SQL step and normalize SQL runtime errors |
| Backend step exports | `core/steps/__init__.py` | Modified | Expose SQL step executor |
| Frontend widget registry | `ui-react/src/components/widgets/WidgetRenderer.tsx` | Modified | Add chart schemas/components to union + switch |
| Frontend visualization components | `ui-react/src/components/widgets/visualizations/*` | New | Implement line/bar chart rendering |
| Frontend type contracts | `ui-react/src/types/config.ts` | Modified | Add `sql` step + chart widget types |
| Schema composer | `scripts/generate_react_sdui_schema.mjs` | Modified | Add chart widget names to `PrimitiveWidget` and compat defs |
| Combined schema artifact | `config/schemas/integration.schema.json` | Modified (generated) | Enable editor-time validation for SQL/chart contracts |
| Docs | `docs/flow/*`, `docs/sdui/*`, `docs/frontend/*` | Modified | Keep architecture/contract docs synchronized |

## Recommended Build Order (Dependency-Constrained)

1. **Define contracts first (backend + SDUI schemas)**
   - Update `StepType`, SQL args schema, chart widget Zod schema signatures.
   - Reason: runtime and editor paths both depend on stable contracts.
2. **Implement backend SQL step runtime**
   - Add `core/steps/sql_step.py`, wire executor dispatch, add deterministic error codes.
   - Reason: frontend charts are useless without structured Integration Data.
3. **Wire frontend chart rendering**
   - Register chart widgets in `WidgetRenderer`, add visualization components and type unions.
   - Reason: now runtime data shape is known and testable.
4. **Regenerate and verify composed schema**
   - Run `make gen-schemas`; ensure Monaco schema includes SQL and chart nodes.
   - Reason: authoring UX and backend validation must agree.
5. **Integration examples + docs sync**
   - Add one SQL-backed integration example template and doc updates.
   - Reason: prevents contract ambiguity for integration authors.
6. **Test gates in dependency order**
   - Backend first (`make test-backend`), then frontend (`make test-frontend`), then typecheck (`make test-typecheck`), then impacted (`make test-impacted`).
   - Reason: catches contract/runtime regressions before full-stack validation.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 sources | Current monolith is sufficient; enforce per-step timeout + max rows to cap memory |
| 100-500 sources | Add connector pooling per driver and stricter refresh staggering to avoid DB burst load |
| 500+ sources | Separate fetch workers from API process and introduce queue-based execution throttling |

### Scaling Priorities

1. **First bottleneck:** large result sets (`rows` payload size). Mitigate via `max_rows`, query-side aggregation, and script-step downsampling.
2. **Second bottleneck:** concurrent connector pressure during refresh waves. Mitigate via executor concurrency tuning and connector-specific pool limits.

## Anti-Patterns

### Anti-Pattern 1: Frontend-Driven Query Logic

**What people do:** add query/aggregation logic inside chart components.  
**Why it's wrong:** duplicates backend logic, breaks Flow boundary, and creates non-deterministic rendering behavior.  
**Do this instead:** keep query + transformation in `sql`/`script` flow steps, render only final Integration Data in widgets.

### Anti-Pattern 2: Credential Leakage Through `outputs`

**What people do:** map DSN/password/token fields into `outputs` for convenience.  
**Why it's wrong:** `outputs` persist as plaintext Integration Data and may surface in UI payloads.  
**Do this instead:** store secrets through `secrets` channel only and reference with `{secret_name}` during SQL step arg resolution.

### Anti-Pattern 3: Unbounded Query Contracts

**What people do:** allow arbitrary query size/time and write-capable statements.  
**Why it's wrong:** risks stalled refresh loops, local resource exhaustion, and accidental destructive mutations.  
**Do this instead:** enforce read-only mode by default, timeout, and maximum rows at step runtime.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL | `sql` step with DSN/SSL params from secrets | Prefer read-only DB role and bounded query timeout |
| MySQL | `sql` step with DSN/credential secret refs | Normalize numeric/date types before output mapping |
| SQLite | `sql` step with file path | Constrain path handling and enforce read-only mode where possible |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `config_loader` ↔ `executor` | Pydantic models (`StepConfig`) | `StepType.sql` must be parsed before executor dispatch |
| `executor` ↔ `sql_step` | Direct async function call | SQL step returns normalized envelope; executor remains channel-mapping owner |
| `executor` ↔ `DataController` | `upsert/set_state` | No storage schema change required for SQL capability |
| `Data API` ↔ `WidgetRenderer` | `/api/data/{source_id}` JSON | Chart widgets consume same `DataResponse.data` envelope as existing widgets |
| `WidgetRenderer` ↔ schema generator | `WidgetSchema` import | Update `generate_react_sdui_schema.mjs` static widget group refs for charts |

## Sources

- `docs/terminology.md`
- `docs/flow/01_architecture_and_orchestration.md`
- `docs/flow/02_step_reference.md`
- `docs/sdui/01_architecture_and_guidelines.md`
- `docs/sdui/02_component_map_and_categories.md`
- `docs/sdui/03_template_expression_spec.md`
- `docs/frontend/01_engineering_guide.md`
- `core/config_loader.py`
- `core/executor.py`
- `core/steps/http_step.py`
- `core/steps/auth_step.py`
- `core/steps/script_step.py`
- `core/api.py`
- `scripts/generate_schemas.py`
- `scripts/generate_react_sdui_schema.mjs`
- `ui-react/src/components/widgets/WidgetRenderer.tsx`
- `ui-react/src/components/BaseSourceCard.tsx`
- `ui-react/src/pages/Dashboard.tsx`
- `ui-react/src/types/config.ts`
- `ui-react/src/components/editor/YamlEditorWorkerSetup.ts`

---
*Architecture research for: SQL connector steps + chart widgets integration in Glanceus*
*Researched: 2026-03-23*
