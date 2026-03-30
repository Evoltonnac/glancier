---
status: investigating
trigger: "Investigate issue: sql-postgresql-generated-chart-suite-line-area-blank"
created: 2026-03-27T07:50:25Z
updated: 2026-03-27T07:54:24Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Cartesian adapter builds sparse pivot rows for `series` charts (missing keys as `undefined`) and passes numeric-like strings through; with alternating-series PostgreSQL data this can yield no visible line/area paths.
test: Add a chart adapter regression test for alternating-series rows asserting explicit null placeholders and numeric y-values in rendered chart data.
expecting: Current implementation should fail this test; fixing pivot normalization should make line/area render data points consistently.
next_action: Implement failing test in `ChartWidgets.test.tsx`, then patch `rechartsAdapter.tsx` to normalize y-values and fill missing series keys with null.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: line and area charts should render data similarly to other charts in the same suite.
actual: line and area charts are blank; the other two charts in this suite render correctly.
errors: not provided yet.
reproduction: run the generated PostgreSQL chart suite integration using config/integrations/test_sql_postgresql_generated_chart_suite.yaml and observe chart outputs.
started: not provided yet.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-27T07:50:49Z
  checked: `.planning/debug/knowledge-base.md`
  found: Knowledge base file is missing in this repo.
  implication: No known-pattern bootstrap available; proceed with standard evidence-driven investigation.

- timestamp: 2026-03-27T07:51:50Z
  checked: `config/integrations/test_sql_postgresql_generated_chart_suite.yaml`
  found: Only line+area consume `pg_timeseries_rows`; pie+table consume `pg_mix_rows` and likely bypass timeseries-specific issues.
  implication: Root cause is likely tied to timeseries data content/typing or Cartesian chart rendering path, not generic chart widget runtime.

- timestamp: 2026-03-27T07:51:50Z
  checked: `config/integrations/test_sql_sqlite_generated_chart_suite.yaml`
  found: SQLite generated suite uses near-identical `Chart.Line` encoding and works in prior tests.
  implication: The failing behavior is likely PostgreSQL dataset/typing specific rather than a universal chart-schema problem.

- timestamp: 2026-03-27T07:53:11Z
  checked: `.planning/debug/postgresql-generated-chart-suite-invalid-chart-config.md` and `ui-react/src/components/widgets/charts/Chart{Line,Area,Pie,Table}.tsx`
  found: Earlier invalid-config hypothesis is stale; current chart widgets validate against `deriveSqlFieldsFromRows(rows)` rather than global `data.sql_response.fields`.
  implication: Present issue is not field-metadata mismatch; likely a rendering/data coercion problem after validation succeeds.

- timestamp: 2026-03-27T07:53:11Z
  checked: `core/sql/normalization.py`
  found: SQL normalization serializes `Decimal` to string before sending rows to UI.
  implication: PostgreSQL numeric-heavy rows can arrive as numeric-like strings, which may pass validation but fail Cartesian rendering expectations.

- timestamp: 2026-03-27T07:54:24Z
  checked: `core/steps/sql_step.py` and `ui-react/src/components/widgets/charts/adapters/rechartsAdapter.tsx`
  found: SQL step always emits normalized serialized rows; cartesian adapter pivots series rows without backfilling missing series keys and without y-value coercion.
  implication: PostgreSQL alternating-series rows can produce sparse data points that line/area may fail to draw as expected.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: ""
fix: ""
verification: ""
files_changed: []
