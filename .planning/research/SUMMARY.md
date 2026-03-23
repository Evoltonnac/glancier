# Project Research Summary

**Project:** Glanceus milestone v1.2
**Domain:** Config-first personal data hub extension (SQL steps + chart widgets + usability)
**Researched:** 2026-03-23
**Confidence:** MEDIUM-HIGH

## Executive Summary

Glanceus v1.2 is a contract-first expansion of the existing `auth -> fetch -> parse -> render` pipeline: add a backend-owned SQL step, emit normalized Integration Data, and render that data through SDUI chart widgets. The research converges on a conservative approach: one `sql` step type with connector strategy behind it, strict read-only and guardrail defaults, and no frontend data-access logic.

The recommended implementation path is to lock contracts first (step schema + widget schema), then build SQL runtime normalization, then wire chart rendering. This keeps editor/runtime behavior consistent and limits regression risk in a system that already depends on schema generation and stable dashboard state ownership. Reusing existing stack choices (`SQLAlchemy`, `psycopg`, `aiosqlite`, `recharts`) minimizes dependency churn for the milestone.

Primary risks are unsafe SQL interpolation, credential leakage, async starvation from blocking DB calls, and schema drift between backend/frontend/docs. Mitigation is explicit: typed/bound params only, secret-channel-only credential handling with redaction, timeout/max-row/concurrency limits, and coordinated schema+renderer+docs updates in the same phase.

## Key Findings

### Recommended Stack

Stack research strongly supports extending current project patterns rather than introducing new architectural layers. Backend should use SQLAlchemy Core (async-friendly) with scoped drivers; frontend should stay on existing Recharts for core chart types.

**Core technologies:**
- `SQLAlchemy 2.0.48`: unified SQL execution abstraction across connectors, with explicit parameter binding and mature dialect support.
- `psycopg 3.3.3`: primary PostgreSQL path compatible with SQLAlchemy `postgresql+psycopg://` sync/async style.
- `aiosqlite 0.22.1`: async SQLite path for local-first scenarios aligned with current async executor model.
- `Recharts 2.15.0` (existing): chart rendering without adding another visualization runtime or large frontend migration.

### Expected Features

v1.2 scope should prioritize secure SQL execution and reliable chart rendering over broad BI-style feature expansion.

**Must have (table stakes):**
- Read-only SQL step with secure connection profiles, timeout/row-limit guardrails, and deterministic failures.
- Typed parameterized SQL bound from existing runtime channels (not string interpolation).
- Normalized SQL output contract (`rows` + typed field metadata) for stable chart consumption.
- Core chart widgets (line, bar, area, pie/donut, table) with empty/error fallback states.
- Fast authoring preview loop (query + chart preview) with `error_code`-driven diagnostics and i18n-ready messaging.

**Should have (competitive):**
- Dashboard-level filters that can bind to SQL parameters across multiple widgets.
- Metric/Signal-aware mapping hints from preview schema.
- Hybrid Bento card patterns (chart + KPI overlays) after base chart stability is proven.

**Defer (v2+):**
- Full visual SQL IDE / notebook-like experience.
- Mutation SQL and ETL-like write flows.
- Advanced chart families/plugins and federated cross-database query workflows.

### Architecture Approach

Architecture findings are consistent with current Glanceus boundaries: backend owns SQL connectivity, guardrails, and normalization; frontend owns SDUI validation/rendering only. New capability should land as a new step module (`core/steps/sql_step.py`) plus contract updates (`core/config_loader.py`, schema generators, `WidgetRenderer` unions), not as cross-layer shortcuts.

**Major components:**
1. `core/config_loader.py` + schema generation: define/validate `use: sql` and chart widget contracts as the source of truth.
2. `core/executor.py` + `core/steps/sql_step.py`: execute parameterized SQL with connector strategy, guardrails, and normalized outputs.
3. `WidgetRenderer` + chart visualization components: render normalized Integration Data with strict runtime validation and graceful fallback.

### Critical Pitfalls

1. **Unsafe SQL interpolation** — enforce typed bound params only; allowlist dynamic identifiers instead of raw string construction.
2. **Credential leakage in outputs/errors/logs** — keep DB secrets in secret channels only and add SQL-specific redaction for diagnostics.
3. **Blocking SQL path in async executor** — use async drivers or bounded thread offload with hard timeout/cancel semantics.
4. **Schema drift across backend/frontend/docs** — ship chart and SQL contracts as one coordinated schema+renderer+docs change set.
5. **Dashboard state sync loops from filter additions** — preserve `useViewTabsState` as single owner and keep SWR->store sync idempotent.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: SQL Contract and Safety Guardrails
**Rationale:** Security and contract correctness are foundational dependencies for every later SQL/chart feature.
**Delivers:** `use: sql` schema, typed params contract, read-only enforcement, timeout/max-rows defaults, secret/redaction rules, deterministic SQL `error_code` taxonomy.
**Addresses:** Secure SQL profiles, parameterized SQL, query guardrails (P1 features).
**Avoids:** SQL interpolation, placeholder mismatch, credential leakage.

### Phase 2: SQL Runtime Integration and Data Normalization
**Rationale:** Frontend rendering cannot be reliable until backend emits stable normalized Integration Data.
**Delivers:** `core/steps/sql_step.py`, connector strategy wiring in executor, per-driver placeholder translation, normalized result envelope (`rows`, `columns/fields`, `row_count`, timing), bounded concurrency/pooling baseline.
**Uses:** SQLAlchemy + psycopg + aiosqlite stack.
**Implements:** Backend execution boundary and persistence path without changing frontend ownership.

### Phase 3: Chart Widget Contract and Renderer Integration
**Rationale:** Once SQL output is stable, chart widgets can be added with low cross-layer ambiguity.
**Delivers:** SDUI chart widget schemas/unions, `WidgetRenderer` registration, core chart components (line/bar/area/pie/table), empty/error fallbacks, generated schema sync for authoring.
**Addresses:** Core chart baseline and fallback resilience.
**Avoids:** Recharts container-sizing failure patterns and chart schema drift.

### Phase 4: Usability, Diagnostics, and Dashboard Filter Hardening
**Rationale:** Usability and cross-widget filtering depend on stable SQL+chart primitives already in place.
**Delivers:** Query/chart preview loop, stage-specific localized diagnostics, dashboard filter-to-SQL param binding, state-loop regression tests, i18n coverage for new keys.
**Addresses:** Authoring usability and differentiator features.
**Avoids:** Generic error UX, untranslated copy, repeated render/request loops.

### Phase 5: Cross-layer Performance and Scale Hardening (if milestone capacity allows)
**Rationale:** Guardrails exist earlier, but stress behavior needs explicit tuning before broader source adoption.
**Delivers:** Result-size pressure tests, pool/concurrency tuning, large-card rendering performance checks, practical limits documentation.
**Addresses:** Storage/runtime scaling risks and scheduler robustness.
**Avoids:** Pool exhaustion, unbounded payload growth, chart interaction lag.

### Phase Ordering Rationale

- Contract-first sequencing is mandatory because schema generation and runtime validation are shared gates across backend/frontend.
- SQL runtime normalization must precede chart work to avoid frontend business logic creep and data-shape drift.
- Usability/filter enhancements should follow stable primitives to prevent state-management regressions in dashboard flows.
- Performance hardening can be staged last, but with guardrails introduced early to cap blast radius.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Connector matrix details (placeholder translation, pool defaults, cancellation behavior) need targeted implementation-level validation per supported DB.
- **Phase 4:** Multi-widget filter binding and preview UX need focused testing/research to avoid `useViewTabsState` sync regressions.
- **Phase 5:** Performance thresholds for local-first runtime (row limits, payload sizes, concurrent refresh behavior) need benchmark-driven tuning.

Phases with standard patterns (skip research-phase):
- **Phase 1:** SQL safety patterns are well-documented (OWASP + driver docs) and map cleanly to existing Glanceus contract architecture.
- **Phase 3:** Widget integration follows established SDUI renderer/schema extension patterns already used in repo.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions and compatibility are backed by official package/docs and existing repository constraints. |
| Features | MEDIUM | Competitive baseline is clear, but prioritization beyond P1 includes product judgment and depends on milestone capacity. |
| Architecture | MEDIUM-HIGH | Aligns strongly with current Glanceus boundaries and code seams; connector rollout specifics still need implementation validation. |
| Pitfalls | MEDIUM-HIGH | Risk classes are well-supported by security/runtime patterns, but exact probability depends on final connector scope and workload shape. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **DB scope lock for v1.2:** decide whether MySQL is in-scope at launch or deferred after PostgreSQL+SQLite validation.
- **Canonical SQL param contract:** finalize placeholder translation rules and rejection behavior for unsupported identifier parameterization.
- **Timestamp normalization policy:** define exact UTC/timezone contract for chart-bound fields and cross-driver consistency tests.
- **Preview API scope:** confirm how far query/chart preview goes in v1.2 (single-widget vs dashboard-linked filters).
- **Performance acceptance targets:** set explicit limits (max rows, refresh concurrency, payload size budgets) before phase execution.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — stack recommendations, versions, compatibility, and integration points.
- `.planning/research/ARCHITECTURE.md` — component boundaries, data flow, contract locations, and build order.
- `.planning/research/PITFALLS.md` — security/runtime/UX pitfalls with prevention and phase mapping.
- SQLAlchemy official docs and dialect docs — async usage and connector behavior.
- Psycopg and sqlite3 official docs — parameter binding and safe SQL composition.
- OWASP SQL Injection Prevention Cheat Sheet — baseline safety controls.

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` — table stakes/differentiators/anti-features and competitor-informed prioritization.
- Metabase/Grafana documentation — feature expectation baseline for SQL parameterization, filters, and visualization workflows.
- Recharts docs/wiki — responsive behavior/performance patterns and version-specific constraints.

### Tertiary (LOW confidence)
- Superset capability references with partial content extraction — used only as directional signal for feature scope comparisons.

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
