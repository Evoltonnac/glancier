---
status: investigating
trigger: "Investigate issue: postgresql-generated-chart-suite-invalid-chart-config"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:22:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Chart widgets validate against the global data.sql_response.fields metadata instead of query-specific field outputs, so the PostgreSQL generated suite mixes row data from one step with field metadata from another step or no matching field metadata at all.
test: Compare the PostgreSQL suite outputs with chart component validation inputs and confirm there is no query-specific fields binding for pg_timeseries_rows/pg_mix_rows.
expecting: The suite should expose rows/count only, while chart components still read data.sql_response.fields; that makes line/area validation fail on metric_day/latency_score/service and can misvalidate other charts depending on whichever sql_response.fields is globally present.
next_action: report confirmed root cause and fix direction

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Different chart widgets should render correctly from the PostgreSQL generated chart suite config.
actual: Charts show Invalid chart configuration instead of rendering. No additional console/browser error was reported by the user.
errors: UI message only: `Invalid chart configuration` / `One or more required fields are missing or incompatible for this chart type. Update the field mapping and try again.`
reproduction: Use `config/integrations/test_sql_postgresql_generated_chart_suite.yaml` during current phase acceptance flow. Relevant runtime data includes `pg_timeseries_rows`, `pg_timeseries_count`, `pg_mix_rows`, and `pg_mix_count` with sample rows supplied by the user.
started: Issue surfaced during current phase acceptance, after Phase 10 work.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The PostgreSQL generated chart YAML is structurally invalid for the runtime chart schema.
  evidence: Runtime chart schemas in /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/shared/chartSchemas.ts accept the same data_source and encoding structure used by the YAML.
  timestamp: 2026-03-27T00:22:00Z

- hypothesis: PostgreSQL-specific type labels alone explain the failure.
  evidence: Backend normalization in /Users/xingminghua/Coding/evoltonnac/glanceus/core/sql/normalization.py canonicalizes common PostgreSQL hints like text, varchar, numeric, date, and timestamp to string/decimal/date/datetime before they reach the UI.
  timestamp: 2026-03-27T00:22:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-27T00:05:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/.planning/debug/knowledge-base.md
  found: Knowledge base file does not exist.
  implication: No prior resolved pattern is available; investigate normally.

- timestamp: 2026-03-27T00:05:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/config/integrations/test_sql_postgresql_generated_chart_suite.yaml
  found: The PostgreSQL generated suite defines Chart.Line, Chart.Area, Chart.Pie, and Chart.Table widgets using encoding/data_source fields with populated SQL outputs.
  implication: The config appears structurally intentional; failure is likely in runtime validation or schema conversion rather than absent data bindings.

- timestamp: 2026-03-27T00:08:00Z
  checked: code search in /Users/xingminghua/Coding/evoltonnac/glanceus
  found: The exact invalid-chart copy is emitted by chart widget UI/tests, and chart-related implementation concentrates in chartSchemas.ts, chartFieldValidation.ts, ChartLine.tsx, ChartArea.tsx, ChartPie.tsx, ChartTable.tsx, and WidgetRenderer.tsx.
  implication: The rejection path is likely local to frontend chart state derivation rather than a backend-only failure.

- timestamp: 2026-03-27T00:12:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/WidgetRenderer.tsx and shared/chartSchemas.ts
  found: Runtime widget schema accepts chart widgets with resolved array data_source values and the same encoding shape used in the PostgreSQL YAML.
  implication: The widgets are unlikely to fail at top-level schema parsing; the later chart-specific validation path is a stronger suspect.

- timestamp: 2026-03-27T00:12:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/shared/chartFieldValidation.ts and chart component files
  found: Chart components call validateChartEncoding against sql_response.fields and classify any invalid_field_type or unknown_field result as config_error before rendering.
  implication: A mismatch between SQL field metadata types/names and validator expectations would directly produce the user-visible Invalid chart configuration state.

- timestamp: 2026-03-27T00:16:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/chartSchemas.test.ts and Phase 10 plan/test fixtures
  found: Existing frontend tests only cover field metadata types datetime, float, integer, and text.
  implication: PostgreSQL-specific field type labels may be untested and therefore rejected by the current validator.

- timestamp: 2026-03-27T00:22:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/core/sql/normalization.py
  found: SQL normalization maps PostgreSQL hints such as text -> string, varchar -> string, numeric -> decimal, date -> date, and timestamp/timestamptz -> datetime.
  implication: Raw PostgreSQL type naming is normalized before reaching the UI, so type-label incompatibility is not the primary failure mechanism.

- timestamp: 2026-03-27T00:22:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/config/integrations/test_sql_postgresql_generated_chart_suite.yaml and /Users/xingminghua/Coding/evoltonnac/glanceus/config/integrations/test_sql_sqlite_generated_chart_suite.yaml
  found: The generated chart suites export only *_rows and *_count outputs, not *_fields. Their chart widgets bind data_source to those row outputs.
  implication: The widgets have query-specific rows but no query-specific field metadata path available at render time.

- timestamp: 2026-03-27T00:22:00Z
  checked: /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/charts/ChartLine.tsx, /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/charts/ChartArea.tsx, /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/charts/ChartPie.tsx, /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/charts/ChartTable.tsx
  found: All chart components ignore query-specific output names and instead validate against data.sql_response.fields from the ambient data object.
  implication: In multi-query suites, chart rows and field metadata can come from different SQL steps or fields can be absent entirely, producing false config_error states.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Chart validation uses the global data.sql_response.fields metadata instead of field metadata paired with each chart's own data_source output. The PostgreSQL generated suite only outputs pg_timeseries_rows/pg_mix_rows and counts, so the line/area widgets validate metric_day/latency_score/service against unrelated or missing sql_response.fields and are rejected as Invalid chart configuration.
fix: Straightforward. Either expose and bind per-query *_fields metadata for chart widgets, or change chart validation to derive compatible field metadata from the same query output context as the bound rows instead of always reading data.sql_response.fields.
verification:
files_changed: []
