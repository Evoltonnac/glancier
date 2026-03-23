# Feature Research

**Domain:** Config-first SQL query steps and chart widgets for a personal data hub
**Researched:** 2026-03-23
**Confidence:** MEDIUM

Scope note: this file only covers new v1.2 capabilities (SQL data-source query + chart widgets + authoring usability), assuming existing auth/fetch/parse/render runtime already works.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| SQL connection profiles with secret references and SSL options | Mature tools expose per-database connection config and transport security by default | MEDIUM | Must plug into existing secret storage + config loader validation; ship a constrained engine allowlist first (for example PostgreSQL/MySQL/SQLite) |
| Parameterized SQL (typed variables) | Metabase/Grafana/Superset all support query-time variables for reuse and filtering | HIGH | Depends on executor variable precedence (`outputs > context > secrets`) and strict type binding to avoid SQL injection paths |
| Query guardrails (read-only contract, timeout, row limit, cancellation) | Mature products prevent runaway/unsafe queries and surface deterministic failures | HIGH | Depends on existing retry/timeout policy and deterministic `error_code` surfaces; add per-step `max_rows`, `timeout_ms`, `cancelable` |
| Result normalization for charting (time, dimension, measure typing) | Chart engines expect shaped data (especially time series) | MEDIUM | Add a stable SQL-step output schema so widgets receive predictable Integration Data, not raw driver tuples |
| Core chart widgets (line, bar, area, pie/donut, table) | These are baseline chart types across BI/dashboard tools | MEDIUM | Reuse existing SDUI widget shell; define minimal chart schema contract before adding advanced chart families |
| Empty/invalid-data fallback states in chart widgets | Mature dashboards degrade gracefully when data shape mismatches | MEDIUM | Must preserve deterministic diagnostics (`error_code`) and avoid widget-level crashes/white screens |
| Dashboard-level filter controls connected to SQL params | Users expect one filter to update multiple charts/cards | HIGH | Depends on dashboard state owner (`useViewTabsState`) and idempotent SWR/Zustand sync contracts |
| Fast authoring loop (query run + data preview + chart preview) | Superset/Grafana/Metabase all optimize query-to-visual feedback cycles | MEDIUM | Add lightweight preview endpoint + schema hints; do not build a full IDE in this milestone |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Config-first SQL step packs (connection + query + normalization presets) | Keeps Glanceus core promise: add integrations without backend code changes | MEDIUM | Ship curated YAML patterns for common SQL tasks (single-metric, grouped trend, top-N ranking) |
| Metric/Signal-aware chart mapping assistant | Reduces mapping friction by aligning SQL columns to Glanceus terminology | MEDIUM | Suggest `metric`, `signal`, `timestamp`, `dimension` bindings from preview schema; user can override |
| Deterministic SQL/chart diagnostics with actionable recovery hints | Stronger reliability than generic BI errors for personal automation users | MEDIUM | Extend error taxonomy for connection/auth/query/schema/widget stages; keep i18n key-based messaging |
| Hybrid Bento Cards (chart + KPI/signal overlays in one widget contract) | Better high-density “glanceability” than plain chart dashboards | HIGH | Builds on existing Bento shell and avoids separate chart-only pages; keep widget state display-only |
| Template portability across sources (same chart template, different SQL sources) | Speeds integration authoring and reuse | HIGH | Requires strict normalized output schema and compatibility checks during source-template binding |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full visual SQL IDE (schema browser, query formatter, lineage, notebook UX) in v1.2 | Feels “pro” and familiar from BI tools | Large scope jump and weak alignment with config-first milestone objective | Provide minimal preview + typed parameter hints + examples |
| Allowing write/mutation SQL in integration steps | Users may want ETL-like automation | Expands risk surface (data corruption, permissions, audit), conflicts with read-mostly dashboard intent | Enforce read-only query contract for v1.2 |
| Shipping many advanced chart types early (Sankey, radar, geospatial, custom plugins) | Looks feature-rich | High maintenance and weak early user value; increases schema complexity | Start with core 5 chart families and table fallback |
| In-app cross-database federated joins as first release target | Promises “single pane” analytics | Requires heavy query engine/optimization/security work beyond milestone | Use one SQL source per step; combine at template layer only when shapes align |

## Feature Dependencies

```text
SQL Connection Profiles
    └──requires──> Secret Storage + Settings Contracts (already shipped)

Parameterized SQL
    └──requires──> Flow Variable Resolution (already shipped)
                       └──requires──> Deterministic Validation Errors (already shipped)

Query Guardrails (timeout/limit/cancel)
    └──requires──> Executor Retry/Timeout Framework (already shipped)

Chart Widgets (line/bar/area/pie/table)
    └──requires──> Normalized SQL Output Schema
                       └──requires──> Data Type Inference + Null Handling

Dashboard Filter Controls ──enhances──> Parameterized SQL
Preview Loop (query+chart) ──enhances──> Authoring Usability

Write-capable SQL ──conflicts──> Local-first safe deterministic runtime goal
```

### Dependency Notes

- **SQL Connection Profiles requires Secret Storage + Settings Contracts:** connections must reference encrypted secrets, never duplicate credential storage semantics.
- **Parameterized SQL requires Flow Variable Resolution:** SQL params should use the existing runtime variable channels instead of introducing a parallel parameter system.
- **Chart Widgets require Normalized SQL Output Schema:** chart contracts become unstable without explicit type/category/time mapping.
- **Dashboard Filter Controls enhances Parameterized SQL:** shared filters become useful only when SQL variables are typed and validated.
- **Write-capable SQL conflicts with runtime safety goals:** mutation queries break deterministic refresh assumptions and raise failure blast radius.

## MVP Definition

### Launch With (v1)

Minimum viable product for this milestone.

- [ ] SQL step with secure connection profile + read-only execution + timeout/row-limit guardrails — baseline safe query runtime
- [ ] Typed SQL parameters mapped from dashboard/source context — baseline reusability and filtering
- [ ] Normalized SQL output contract (`rows` + typed fields metadata) — required for stable widgets
- [ ] Core chart widgets (line/bar/area/pie/table) with empty/error fallback — baseline visualization coverage
- [ ] Query/chart preview with deterministic diagnostics (`error_code` + i18n-ready messages) — usability requirement for lower authoring friction

### Add After Validation (v1.x)

- [ ] Dashboard global filters bound to multiple SQL-backed widgets — add once single-widget flow is stable
- [ ] Metric/Signal auto-mapping suggestions from preview schema — add once enough sample integrations exist
- [ ] Query result caching policy per SQL step — add after measuring query cost/latency pain

### Future Consideration (v2+)

- [ ] Cross-source template portability checks with auto-remap — defer until schema contract is proven in production
- [ ] Advanced chart families and plugin extension model — defer until core chart reliability is strong
- [ ] Optional federated query patterns — defer unless a strong user demand signal appears

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Read-only SQL step with secure connection | HIGH | MEDIUM | P1 |
| Query guardrails (timeout/row-limit/cancel) | HIGH | HIGH | P1 |
| Typed SQL parameters | HIGH | HIGH | P1 |
| Normalized SQL output schema | HIGH | MEDIUM | P1 |
| Core chart widgets (5 types) | HIGH | MEDIUM | P1 |
| Empty/error fallback for charts | HIGH | LOW | P1 |
| Query/chart preview loop | HIGH | MEDIUM | P1 |
| Dashboard-global filter binding | MEDIUM | HIGH | P2 |
| Metric/Signal auto-mapping assist | MEDIUM | MEDIUM | P2 |
| Per-step SQL query caching controls | MEDIUM | MEDIUM | P2 |
| Advanced chart families/plugins | LOW | HIGH | P3 |
| Federated multi-DB query support | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A (Metabase) | Competitor B (Grafana) | Our Approach |
|---------|--------------------------|-------------------------|--------------|
| SQL parameterization | Native SQL variables, including optional/filter-aware parameter widgets | Dashboard/template variables integrated with SQL query editors | Reuse flow variable channels with explicit typed binding in YAML |
| Query safety controls | Native editor emphasizes reading data, plus caching/admin controls | Query editor supports defaults/limits and datasource-driven guardrails | Enforce read-only + step-level timeout/limit + deterministic error taxonomy |
| Chart baseline | Broad built-in chart set with visualization switching | Rich panel/visualization system with table and time-series focus | Start with core 5 chart widgets + table fallback, optimize for Bento density |
| Authoring feedback loop | SQL editor and visualization iteration inside one workflow | Query editor + panel preview + transformations workflow | Lightweight query + chart preview endpoint designed for config authoring flow |
| Advanced extensibility | Deep BI features but heavier product surface | Very extensible panels/data-source ecosystem | Delay heavy extensibility; prioritize config-first repeatability |

## Sources

- Metabase docs: SQL editor behavior (read-focused), variables, visualizations, dashboard filters, caching
  - https://www.metabase.com/docs/latest/questions/native-editor/writing-sql (MEDIUM confidence)
  - https://www.metabase.com/docs/latest/questions/native-editor/sql-parameters (HIGH confidence)
  - https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results (MEDIUM confidence)
  - https://www.metabase.com/docs/latest/dashboards/filters (MEDIUM confidence)
  - https://www.metabase.com/docs/latest/configuring-metabase/caching (HIGH confidence)
- Grafana docs: SQL query editor and visualization behavior
  - https://grafana.com/docs/grafana-cloud/connect-externally-hosted/data-sources/postgres/query-editor/ (HIGH confidence)
  - https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/ (MEDIUM confidence)
  - https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/ (MEDIUM confidence)
  - https://grafana.com/docs/grafana/latest/dashboards/variables/ (HIGH confidence)
- Apache Superset docs/site: SQL templating, exploration workflow, and platform capabilities
  - https://superset.apache.org/docs/configuration/sql-templating (HIGH confidence)
  - https://superset.apache.org/docs/databases/supported/ (MEDIUM confidence)
  - https://superset.apache.org/docs/using-superset/exploring-data/ (LOW confidence; page metadata available but content extraction limited)
  - https://superset.apache.org/ (MEDIUM confidence)
  - https://superset.apache.org/docs/api/sql-lab (LOW confidence; endpoint listing used as capability signal)

---
*Feature research for: SQL step + chart widget expansion in Glanceus v1.2*
*Researched: 2026-03-23*
