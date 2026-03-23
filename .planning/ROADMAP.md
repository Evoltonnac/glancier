# Roadmap: Glanceus v1.2

## Overview
This roadmap covers milestone v1.2 only: secure SQL step execution, normalized SQL Integration Data, chart-oriented Bento Card rendering, and usability/diagnostics hardening. Phase numbering continues from shipped v1.1 work, so this milestone starts at Phase 7.

## Phases

**Phase Numbering:**
- Integer phases (7, 8, 9, 10): planned milestone work
- Decimal phases (7.1, 8.1, ...): urgent insertions if needed later

- [ ] **Phase 7: SQL Step Contracts and Safety Guardrails** - Define and enforce secure `use: sql` contracts, guardrails, and deterministic SQL error handling.
- [ ] **Phase 8: SQL Runtime and Integration Data Normalization** - Execute SQL across supported connectors and emit stable normalized Integration Data for templates/widgets.
- [ ] **Phase 9: SQL Chart Widgets and SDUI Rendering** - Add SQL-backed chart widgets with schema-validated field mapping and resilient fallback rendering.
- [ ] **Phase 10: Authoring Usability and Diagnostics Hardening** - Deliver SQL preview flows, localized diagnostics, and dashboard filter integration without state ownership regressions.

## Phase Details

### Phase 7: SQL Step Contracts and Safety Guardrails
**Goal**: Users can safely configure and run read-only SQL steps with deterministic guardrails and failure contracts.
**Depends on**: Phase 6
**Requirements**: SQL-01, SQL-02, SQL-04, SQL-05, SQL-06
**Success Criteria** (what must be TRUE):
  1. User can define a `use: sql` step in Integration YAML with connector profile and secret-backed credentials that pass schema validation.
  2. User can run read-only SQL with typed bound parameters, and unsafe interpolation or disallowed mutation SQL is rejected deterministically.
  3. User can rely on default SQL timeout/max-row guardrails with per-source override behavior applied predictably.
  4. User can diagnose SQL connect/auth/query/guardrail failures through stable `error_code` responses, without credential leakage in logs, API payloads, or persisted artifacts.
**Plans**: TBD

### Phase 8: SQL Runtime and Integration Data Normalization
**Goal**: Users can execute SQL through supported connectors and receive stable normalized Integration Data consumable by existing template channels.
**Depends on**: Phase 7
**Requirements**: SQL-03, DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. User can run one SQL contract model across at least SQLite and PostgreSQL connector profiles and get successful query results.
  2. User can receive normalized SQL Integration Data with `rows` plus typed field metadata that is consistent across supported connectors.
  3. User can rely on deterministic serialization of SQL-native values (`decimal`, `datetime`, `null`, `bytes`) before template/chart consumption.
  4. User can access SQL execution metadata (`row_count`, `duration_ms`, truncation flag) and reference SQL outputs through existing template expression channels.
**Plans**: TBD

### Phase 9: SQL Chart Widgets and SDUI Rendering
**Goal**: Users can visualize normalized SQL Integration Data in Bento Cards through chart widgets with deterministic validation and fallbacks.
**Depends on**: Phase 8
**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04, CHART-05, CHART-06, CHART-07
**Success Criteria** (what must be TRUE):
  1. User can render SQL-backed line, bar, area, pie, and tabular widgets from dashboard templates.
  2. User can configure x/y/series/value field mapping against normalized Integration Data, with runtime schema validation enforcing valid mappings.
  3. User can see deterministic empty/loading/error fallback states on all new chart widgets, and dashboard rendering does not crash or white-screen on invalid/missing data.
**Plans**: TBD

### Phase 10: Authoring Usability and Diagnostics Hardening
**Goal**: Users can author and troubleshoot SQL+chart workflows with faster feedback and stable dashboard state behavior.
**Depends on**: Phase 9
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. User can preview SQL sample rows and inferred field schema during integration authoring before committing refresh settings.
  2. User can troubleshoot SQL/chart setup failures with stable `error_code`-driven messages that are i18n-compatible in `en` and `zh`.
  3. User can apply dashboard-level filters to SQL parameters while preserving canonical `useViewTabsState` ownership and idempotent SWR/Zustand synchronization.
  4. User can complete SQL+chart dashboard workflows without introducing duplicate SWR/Zustand write paths in dashboard management interactions.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. SQL Step Contracts and Safety Guardrails | 0/TBD | Not started | - |
| 8. SQL Runtime and Integration Data Normalization | 0/TBD | Not started | - |
| 9. SQL Chart Widgets and SDUI Rendering | 0/TBD | Not started | - |
| 10. Authoring Usability and Diagnostics Hardening | 0/TBD | Not started | - |
