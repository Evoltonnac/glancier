# Stack Research

**Domain:** Glanceus v1.2 additions (SQL database connector steps + chart widgets)
**Researched:** 2026-03-23
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SQLAlchemy (Core + asyncio) | 2.0.48 | Unified SQL execution layer for a new `sql` step type | One abstraction for multiple SQL backends, mature dialect ecosystem, and explicit parameter binding support to reduce SQL injection risk. |
| psycopg (`psycopg[binary]`) | 3.3.3 | Primary PostgreSQL driver for SQL steps | SQLAlchemy supports sync + async with the same `postgresql+psycopg://` dialect, minimizing branching logic in step handlers. |
| aiosqlite | 0.22.1 | Async SQLite connector for local-first/dev scenarios | Matches async executor style without introducing a separate process or service; good for local data sources and prototyping. |
| Recharts (existing dependency) | 2.15.0 in repo (latest upstream release line is 3.x) | Chart rendering in SDUI widgets | Already present in `ui-react/package.json`, so chart widgets can be added without introducing a second chart runtime or large frontend dependency jump. |

## Integration Points (Explicit)

| Area | Integration Point | Impact |
|------|-------------------|--------|
| Flow schema | `core/config_loader.py` (`StepType`, step args schema map) | Add `sql` step contract (`driver`, `dsn`, `query`, `params`, `timeout_seconds`, optional `fetch` mode). |
| Step execution | `core/steps/sql_step.py` + `core/steps/__init__.py` + `core/executor.py` dispatch | Implement query execution, timeout/retry behavior, and normalized output (`rows`, `row_count`, optional `columns`). |
| Secrets boundary | Existing secrets resolution path (executor/context/secrets channels) | Keep DB credentials backend-only; frontend never receives DSN/password values. |
| Widget schema/render | `ui-react/src/components/widgets/WidgetRenderer.tsx` + `visualizations/` schemas/components | Add chart widget types (line/bar/area/pie minimal set) using existing SDUI validation flow (Zod + template resolution). |
| Template contracts | Integration YAML `templates.widgets` | Keep frontend display-only: data shaping/aggregation remains in backend SQL query output or explicit template expressions. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| asyncpg | 0.31.0 | Alternative PostgreSQL async driver | Use only if psycopg path shows clear bottleneck in milestone validation; otherwise avoid extra driver surface. |
| PyMySQL | 1.1.2 | MySQL/MariaDB connector path | Add only if milestone scope explicitly includes MySQL sources; keep optional to limit binary/runtime variability. |
| Existing `zod` (already in repo) | 4.3.6 | Runtime chart widget config validation | Reuse for chart schema safety (invalid config fallback) instead of adding a new validation package. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `pytest` + `pytest-asyncio` (existing) | SQL step contract and failure-mode tests | Add coverage for parameter binding, timeout, connection failure `error_code`, and output normalization. |
| `vitest` (existing) | Chart widget schema/render regression tests | Validate missing/invalid data fallback and i18n-safe UI behavior without introducing screenshot tooling in this milestone. |

## Installation

```bash
# Backend core additions (SQL step foundation)
pip install "SQLAlchemy>=2.0.48,<2.1" "psycopg[binary]>=3.3.3,<3.4" "aiosqlite>=0.22.1,<0.23"

# Optional backend connectors (only if scope requires)
pip install "PyMySQL>=1.1.2,<1.2"
pip install "asyncpg>=0.31.0,<0.32"

# Frontend chart stack
# No new package required for MVP chart widgets (re-use existing recharts dependency)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SQLAlchemy Core + driver plugins | Direct driver-only implementation per DB (`psycopg`, `sqlite3`, `pymysql` each with custom code) | Only if you intentionally support exactly one DB vendor forever; otherwise maintenance cost grows quickly. |
| Existing Recharts baseline | Apache ECharts (`echarts` + React wrapper) | Choose only when you need advanced chart families/large-scale viz not covered by Recharts, and accept heavier bundle/runtime complexity. |
| Existing Recharts baseline | `react-chartjs-2` + `chart.js` | Choose only if Chart.js plugin ecosystem is specifically required; otherwise this adds another rendering model and peer dependency chain. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Introducing ORM domain models (SQLModel/ORM mapping) for this milestone | v1.2 need is query-step execution, not relational domain modeling; ORM introduces schema lifecycle and model drift risk. | SQLAlchemy Core `text()`/statement execution with explicit output normalization. |
| Alembic/migration stack for source databases | Glanceus is a connector/reader here, not owner of upstream schemas; migrations are out of boundary and add operational risk. | Read-only query contracts plus deterministic error handling. |
| ODBC-first connector strategy (`pyodbc`) | Higher cross-platform packaging friction (desktop/Tauri distribution + native driver requirements). | Native drivers per scoped DB (psycopg, aiosqlite, optional PyMySQL). |
| Adding a second chart engine in v1.2 | Duplicates widget abstraction and test surface; increases maintenance without user-visible MVP gain. | Standardize chart widgets on existing Recharts path. |

## Stack Patterns by Variant

**If milestone scope is PostgreSQL + SQLite only (recommended):**
- Use `SQLAlchemy + psycopg + aiosqlite`
- Because this covers common personal-data SQL use cases with minimal additional dependencies and consistent async orchestration.

**If MySQL is explicitly required in this milestone:**
- Add `PyMySQL` as optional connector (no other stack change)
- Because MySQL support can be isolated at DSN/dialect layer without introducing ORM/migration complexity.

**If chart requirements remain “common dashboard charts” (recommended):**
- Keep `recharts` current baseline and extend SDUI schemas/components
- Because this avoids a high-risk chart-library migration while still enabling line/bar/area/pie widgets.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `SQLAlchemy==2.0.48` | Python 3.10+ app baseline | Project baseline is Python 3.10+; SQLAlchemy supports this. |
| `SQLAlchemy==2.0.48` | `psycopg==3.3.3` via `postgresql+psycopg://` | Same dialect name supports sync/async engine creation, reducing handler branching. |
| `SQLAlchemy==2.0.48` | `aiosqlite==0.22.1` via `sqlite+aiosqlite://` | Suitable for async interface; SQLite remains local-file and thread-mediated. |
| `recharts@2.15.0` | React 18.3.1 current repo stack | Zero new dependency risk for v1.2 charts. |
| Recharts 3.x (latest upstream line) | Requires migration handling | 3.0 introduced state-management breaking changes; defer major upgrade unless explicitly scoped. |

## Sources

- https://pypi.org/project/SQLAlchemy/ — verified latest stable `2.0.48` (released Mar 2, 2026), extras, Python compatibility. (HIGH)
- https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html — async engine usage and asyncio-compatible dialect requirement. (HIGH)
- https://docs.sqlalchemy.org/en/20/dialects/postgresql.html — `postgresql+psycopg://` sync+async behavior; `postgresql+asyncpg://` alternative. (HIGH)
- https://docs.sqlalchemy.org/en/20/dialects/sqlite.html — `sqlite+aiosqlite://` behavior and async caveat. (HIGH)
- https://docs.sqlalchemy.org/en/20/dialects/mysql.html — `mysql+pymysql://` and `mysql+asyncmy://` options. (HIGH)
- https://pypi.org/project/psycopg/ — latest `3.3.3`, Python >=3.10. (HIGH)
- https://pypi.org/project/aiosqlite/ — latest `0.22.1`, Python >=3.9. (HIGH)
- https://pypi.org/project/asyncpg/ — latest `0.31.0`, Python >=3.9. (HIGH)
- https://pypi.org/project/PyMySQL/ — latest `1.1.2`, Python >=3.8. (HIGH)
- https://github.com/recharts/recharts/releases — latest release line includes `v3.8.0` (as of research date). (MEDIUM)
- https://github.com/recharts/recharts/wiki/3.0-migration-guide — 3.x breaking changes and new minimum requirements. (HIGH)
- /Users/xingminghua/Coding/evoltonnac/glanceus/requirements.txt — current backend dependency baseline. (HIGH)
- /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/package.json — confirms existing `recharts` dependency (`^2.15.0`). (HIGH)
- /Users/xingminghua/Coding/evoltonnac/glanceus/core/config_loader.py — existing step-type and schema integration pattern. (HIGH)

---
*Stack research for: Glanceus SQL connector step + chart widget expansion (v1.2)*
*Researched: 2026-03-23*
