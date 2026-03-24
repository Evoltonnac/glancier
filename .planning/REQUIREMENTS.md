# Requirements: Glanceus v1.2 SQL Data Access and Visualization Expansion

**Defined:** 2026-03-23
**Core Value:** Users can complete auth -> fetch -> parse -> render through config-only integrations without backend hardcoding.

## v1 Requirements

### SQL Step Contracts

- [x] **SQL-01**: User can declare a `use: sql` step in Integration YAML with a connector profile and credentials resolved from `secrets` channels.
- [x] **SQL-02**: User can execute fully user-authored SQL query text (script-like control), and have non-SELECT/high-risk operations detected by static AST analysis and routed to authorization before execution.
- [x] **SQL-03**: User can use multiple SQL connector patterns in one contract model (at least local SQLite and server-side PostgreSQL profiles).
- [x] **SQL-04**: User can rely on default SQL guardrails (timeout, max row limit, deterministic truncation behavior) with per-source overrides.
- [x] **SQL-05**: User can receive deterministic `error_code` responses for SQL connect/auth/query/guardrail failures.
- [x] **SQL-06**: User can run SQL steps without database credentials leaking into logs, API payloads, or persisted runtime artifacts.

### Normalized SQL Integration Data

- [x] **DATA-01**: User can receive SQL query output as normalized Integration Data (`rows` + typed field metadata) that is stable across supported connectors.
- [x] **DATA-02**: User can rely on deterministic serialization for SQL-native values (`decimal`, `datetime`, `null`, `bytes`) before template/chart consumption.
- [x] **DATA-03**: User can consume SQL execution metadata (`row_count`, `duration_ms`, truncation flag) for diagnostics and card rendering.
- [x] **DATA-04**: User can reference SQL outputs through existing template expression channels without moving business logic into frontend widgets.

### Chart Widgets

- [ ] **CHART-01**: User can render SQL-backed line charts in Bento Cards.
- [ ] **CHART-02**: User can render SQL-backed bar charts in Bento Cards.
- [ ] **CHART-03**: User can render SQL-backed area charts in Bento Cards.
- [ ] **CHART-04**: User can render SQL-backed pie charts in Bento Cards.
- [ ] **CHART-05**: User can render SQL-backed tabular views as a chart-compatible widget for dense result inspection.
- [ ] **CHART-06**: User can rely on deterministic empty/loading/error fallback states for all new chart widgets (no renderer crash or white screen).
- [ ] **CHART-07**: User can configure x/y/series/value field mapping from normalized Integration Data with runtime schema validation.

### Usability and Diagnostics

- [ ] **UX-01**: User can preview SQL sample rows and inferred field schema during integration authoring before saving production refresh settings.
- [ ] **UX-02**: User can diagnose SQL/chart setup failures through stable `error_code`-driven, i18n-compatible user messaging (`en`/`zh`).
- [ ] **UX-03**: User can apply dashboard-level filter values to SQL query inputs without breaking canonical `useViewTabsState` ownership and idempotent sync.
- [ ] **UX-04**: User can use SQL+chart workflows without introducing duplicate SWR/Zustand write paths in dashboard management interactions.

## v2 Requirements

### Deferred Capability Expansion

- **SQL-07**: User can use MySQL connector profile as a first-class supported v1.x/v2 extension after PostgreSQL/SQLite baseline validation.
- **SQL-08**: User can configure query result caching and TTL policies to reduce repeated DB load for frequently refreshed cards.
- **CHART-08**: User can use advanced chart families (scatter/heatmap/composed charts) with reusable interaction patterns.
- **UX-05**: User can use reusable SQL query snippets/preset templates across integrations.
- **PERF-01**: User can define explicit performance budgets (max payload, concurrent refresh limits) enforced by runtime policies.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Unguarded write/mutation SQL (`INSERT/UPDATE/DELETE/DDL`) | High-risk SQL must never execute silently; it must be classified and gated by explicit authorization decisions. |
| Full SQL IDE/notebook workflow | High complexity and not required to ship config-first SQL steps + chart widgets. |
| Federated cross-database joins/query planner | Expands architecture scope beyond milestone boundary and increases operational risk. |
| Replacing existing chart rendering foundation | Current stack already includes chart runtime; milestone goal is capability expansion, not renderer migration. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SQL-01 | Phase 8 | Complete |
| SQL-02 | Phase 8 | Complete |
| SQL-03 | Phase 9 | Complete |
| SQL-04 | Phase 8 | Complete |
| SQL-05 | Phase 8 | Complete |
| SQL-06 | Phase 8 | Complete |
| DATA-01 | Phase 9 | Complete |
| DATA-02 | Phase 9 | Complete |
| DATA-03 | Phase 9 | Complete |
| DATA-04 | Phase 9 | Complete |
| CHART-01 | Phase 10 | Pending |
| CHART-02 | Phase 10 | Pending |
| CHART-03 | Phase 10 | Pending |
| CHART-04 | Phase 10 | Pending |
| CHART-05 | Phase 10 | Pending |
| CHART-06 | Phase 10 | Pending |
| CHART-07 | Phase 10 | Pending |
| UX-01 | Phase 11 | Pending |
| UX-02 | Phase 11 | Pending |
| UX-03 | Phase 11 | Pending |
| UX-04 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-24 after v1.2 roadmap renumbering and Phase 8 planning initialization*
