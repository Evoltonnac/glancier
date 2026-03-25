# Roadmap: Glanceus v1.2

## Overview
This roadmap covers milestone v1.2 only: risk-operation trust authorization and rule storage, secure SQL step execution, normalized SQL Integration Data, chart-oriented Bento Card rendering, and usability/diagnostics hardening. Phase numbering continues from shipped v1.1 work, so this milestone starts at Phase 7.

## Phases

**Phase Numbering:**
- Integer phases (7, 8, 9, 10, 11): planned milestone work
- Decimal phases (7.1, 8.1, ...): urgent insertions if needed later

- [x] **Phase 7: Risk-Operation Trust Authorization, Rule Storage, and HTTP Step Refactor** - Add extensible trust authorization for risky connection targets with source-aware persistence and lifecycle cleanup, and refactor `http` step from hard private-target block to trust-gate flow.
- [x] **Phase 8: SQL Step Contracts and Safety Guardrails** - Define and enforce secure `use: sql` contracts, guardrails, and deterministic SQL error handling.
- [x] **Phase 9: SQL Runtime and Integration Data Normalization** - Execute SQL across supported connectors and emit stable normalized Integration Data for templates/widgets.
- [ ] **Phase 10: SQL Chart Widgets and SDUI Rendering** - Add SQL-backed chart widgets with schema-validated field mapping and resilient fallback rendering.
- [ ] **Phase 11: Authoring Usability and Diagnostics Hardening** - Deliver SQL preview flows, localized diagnostics, and dashboard filter integration without state ownership regressions.

## Phase Details

### Phase 7: Risk-Operation Trust Authorization, Rule Storage, and HTTP Step Refactor
**Goal**: Users can safely run local/private connection flows through explicit trust authorization with extensible, source-lifecycle-aware persistence.
**Depends on**: Phase 6
**Requirements**: SEC-HTTP-01, SEC-HTTP-02, SEC-DB-01, STORAGE-TRUST-01
**Success Criteria** (what must be TRUE):
  1. User can trigger a deterministic trust-gate interaction when `http` targets private/loopback hosts without an existing trust decision.
  2. User can persist allow/deny trust decisions in an extensible backend rule model that supports `http`, `db`, and future connectors.
  3. User can delete a source and have source-scoped trust rules cleaned up automatically in the same lifecycle.
  4. User can diagnose trust-gate outcomes with stable `error_code` values and no credential leakage.
**Plans**: 07-01, 07-02

### Phase 8: SQL Step Contracts and Safety Guardrails
**Goal**: Users can safely configure SQL steps with deterministic guardrails, SQL AST risk classification, and trust-gated high-risk operation handling.
**Depends on**: Phase 7
**Requirements**: SQL-01, SQL-02, SQL-04, SQL-05, SQL-06
**Success Criteria** (what must be TRUE):
  1. User can define a `use: sql` step in Integration YAML with connector profile and secret-backed credentials that pass schema validation.
  2. User can run fully user-authored SQL query text (script-like control), and non-SELECT/high-risk statements are classified via static AST analysis and routed to the existing authorization wall before execution.
  3. User can rely on default SQL timeout/max-row guardrails with per-source override behavior applied predictably.
  4. User can diagnose SQL connect/auth/query/guardrail/trust-gate failures through stable `error_code` responses, without credential leakage in logs, API payloads, or persisted artifacts.
**Plans**: 08-01, 08-02, 08-03

### Phase 9: SQL Runtime and Integration Data Normalization
**Goal**: Users can execute SQL through supported connectors and receive stable normalized Integration Data consumable by existing template channels.
**Depends on**: Phase 8
**Requirements**: SQL-03, DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. User can run one SQL contract model across at least SQLite and PostgreSQL connector profiles and get successful query results.
  2. User can receive normalized SQL Integration Data with `rows` plus typed field metadata that is consistent across supported connectors.
  3. User can rely on deterministic serialization of SQL-native values (`decimal`, `datetime`, `null`, `bytes`) before template/chart consumption.
  4. User can access SQL execution metadata (`row_count`, `duration_ms`, truncation flag) and reference SQL outputs through existing template expression channels.
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Add canonical SQL normalization contracts and deterministic value serialization tests.
- [x] 09-02-PLAN.md — Implement sqlite/postgresql runtime adapter parity and canonical metadata envelope wiring.
- [x] 09-03-PLAN.md — Verify output-channel compatibility and synchronize SQL flow/failure documentation.

### Phase 10: SQL Chart Widgets and SDUI Rendering
**Goal**: Users can visualize normalized SQL Integration Data in Bento Cards through chart widgets with deterministic validation and fallbacks.
**Depends on**: Phase 9
**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04, CHART-05, CHART-06, CHART-07
**Success Criteria** (what must be TRUE):
  1. User can render SQL-backed line, bar, area, pie, and tabular widgets from dashboard templates.
  2. User can configure x/y/series/value field mapping against normalized Integration Data, with runtime schema validation enforcing valid mappings.
  3. User can see deterministic empty/loading/error fallback states on all new chart widgets, and dashboard rendering does not crash or white-screen on invalid/missing data.
**Plans**: 3 plans
Plans:
- [ ] 10-01-PLAN.md — Establish chart schemas, SQL field-aware encoding validation, deterministic chart state classifier, and unified fallback frame with Wave 0 tests.
- [ ] 10-02-PLAN.md — Implement Chart.Line/Chart.Bar/Chart.Area/Chart.Pie rendering through internal Recharts adapter and register widgets in WidgetRenderer.
- [ ] 10-03-PLAN.md — Implement Chart.Table dense inspection widget, wire fallback behavior, and synchronize SDUI chart documentation.

### Phase 11: Authoring Usability and Diagnostics Hardening
**Goal**: Users can author and troubleshoot SQL+chart workflows with faster feedback and stable dashboard state behavior.
**Depends on**: Phase 10
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. User can preview SQL sample rows and inferred field schema during integration authoring before committing refresh settings.
  2. User can troubleshoot SQL/chart setup failures with stable `error_code`-driven messages that are i18n-compatible in `en` and `zh`.
  3. User can apply dashboard-level filters to SQL query inputs while preserving canonical `useViewTabsState` ownership and idempotent SWR/Zustand synchronization.
  4. User can complete SQL+chart dashboard workflows without introducing duplicate SWR/Zustand write paths in dashboard management interactions.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Risk-Operation Trust Authorization, Rule Storage, and HTTP Step Refactor | 2/2 | Completed | 2026-03-24 |
| 8. SQL Step Contracts and Safety Guardrails | 3/3 | Completed | 2026-03-24 |
| 9. SQL Runtime and Integration Data Normalization | 3/3 | Complete | 2026-03-24 |
| 10. SQL Chart Widgets and SDUI Rendering | 0/3 | Not started | - |
| 11. Authoring Usability and Diagnostics Hardening | 0/TBD | Not started | - |
