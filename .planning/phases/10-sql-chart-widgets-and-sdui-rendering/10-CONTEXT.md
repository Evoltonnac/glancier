# Phase 10: SQL Chart Widgets and SDUI Rendering - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 10 adds SQL-backed chart widgets that render normalized SQL Integration Data inside Bento Cards through the SDUI renderer.

This phase is limited to:
- adding first-class chart widget types for line, bar, area, pie, and tabular rendering;
- defining chart-facing dataset and field-encoding contracts for normalized `sql_response` data;
- validating chart mappings deterministically at runtime;
- providing resilient loading/empty/error fallback behavior so invalid or missing chart data never white-screens the dashboard.

This phase does not include SQL authoring preview UX, filter-to-query authoring workflows, or broader diagnostics/i18n hardening; those remain in Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Chart library and rendering boundary
- Public SDUI chart contracts must be independent from the underlying chart library and should follow intuitive, industry-familiar naming/behavior rather than Recharts-specific props.
- Phase 10 implementation may use Recharts internally as the rendering engine.
- Chart widgets should be exposed as direct SDUI component types, not wrapped inside a generic outer `Chart` container.
- First-class component names are locked to:
  - `Chart.Line`
  - `Chart.Bar`
  - `Chart.Area`
  - `Chart.Pie`
  - `Chart.Table`

### First-release chart scope
- All five chart widgets ship in Phase 10; do not split the initial release into a smaller subset.
- `Chart.Line`, `Chart.Bar`, and `Chart.Area` should support single-value series plus optional `series`-based grouping in the first release.
- `Chart.Pie` should support `label + value` data and allow donut-style rendering in the first release.
- `Chart.Table` should support dense SQL result inspection through:
  - column selection;
  - column title overrides;
  - simple formatting;
  - sorting;
  - limiting.
- Advanced chart families and more product-like data-grid behavior stay out of Phase 10.

### Dataset and encoding contract
- Every chart widget should declare its dataset explicitly via `data_source`, following the existing SDUI `List` pattern.
- Field selection should be expressed through a chart-oriented `encoding` contract rather than chart-specific ad hoc field props.
- `encoding` should be defined in an industry-familiar, chart-agnostic way, with per-chart allowed channels such as `x`, `y`, `series`, `value`, `label`, and `color`.
- `encoding` field resolution happens inside the dataset context selected by that widget’s `data_source`.
- Public chart props should start with a shared, minimal core surface instead of exposing many low-level visual knobs.
- Initial shared chart prop surface should prioritize stable, portable capabilities such as:
  - `data_source`
  - `encoding`
  - `title`
  - `description`
  - `legend`
  - `colors`
  - `format`
  - `empty_state`
- Each chart type may add a small number of type-specific props only where the capability is core to the chart (for example donut-style support for pie charts, table column definitions for tables).

### Fallback and state behavior
- When `data_source` is empty or resolves to an empty result set, the chart card should render a unified empty-state card rather than an empty chart shell.
- When `encoding` is invalid, required channels are missing, or referenced fields do not exist, the chart card should render a deterministic configuration-error state inside the card rather than attempting implicit recovery.
- When upstream SQL/runtime state is errored or the data does not satisfy chart preconditions, chart widgets should render a unified runtime-error state and should not perform frontend business-logic recovery.
- Loading states should remain chart-specific rather than using one shared loading placeholder for all chart types.
- All chart-state failures must preserve stable card structure and must never white-screen the dashboard.

### Carried-forward constraints from earlier phases
- Keep `use: sql` as the single step contract; chart work must consume normalized outputs rather than introducing connector-specific frontend handling.
- Keep the stable normalized SQL data root centered on `sql_response` and the canonical Integration Data envelope from Phase 9.
- Backend remains responsible for SQL execution, normalization, trust/error classification, and deterministic metadata; frontend remains render-only.
- Stable error/fallback semantics remain mandatory across the chart path.

### Claude's Discretion
- Exact internal adapter structure between SDUI chart schemas and Recharts components, as long as the public chart protocol stays library-agnostic.
- Precise split between shared chart base schema and per-chart schema extensions, as long as the user-facing contract stays coherent and minimal.
- Exact visual design of each chart-specific loading placeholder.
- Exact wording/layout of empty/config-error/runtime-error chart states, as long as they remain deterministic and non-crashing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and active requirements
- `.planning/ROADMAP.md` — Phase 10 goal, dependency boundary, and success criteria.
- `.planning/REQUIREMENTS.md` — `CHART-01` through `CHART-07` acceptance targets for chart widgets and mapping validation.
- `.planning/STATE.md` — current milestone continuity and active focus after Phase 9 completion.
- `.planning/PROJECT.md` — config-first product constraints, backend/frontend ownership boundary, Bento-card product direction.

### Prior phase contracts that must carry forward
- `.planning/phases/08-sql-step-contracts-and-safety-guardrails/08-CONTEXT.md` — SQL contract/security baseline and Phase 10 deferral reference.
- `.planning/phases/09-sql-runtime-and-integration-data-normalization/09-CONTEXT.md` — normalized `sql_response` envelope, field metadata, and frontend render-only boundary.
- `docs/flow/02_step_reference.md` — canonical SQL step/runtime output envelope and normalized `sql_response.*` paths consumed by charts.

### SDUI renderer contracts
- `docs/sdui/01_architecture_and_guidelines.md` — schema-first renderer rules, graceful fallback requirement, and SDUI/Flow boundary.
- `docs/sdui/02_component_map_and_categories.md` — current SDUI component taxonomy and required doc-update surface when adding widget types.
- `docs/sdui/03_template_expression_spec.md` — template binding semantics and safe expression/path behavior relevant to `data_source`/`encoding` resolution.

### Existing code anchors
- `ui-react/src/components/widgets/WidgetRenderer.tsx` — current unified SDUI schema registry, runtime validation flow, and invalid-widget fallback pattern.
- `ui-react/package.json` — existing frontend dependency baseline including Recharts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ui-react/src/components/widgets/WidgetRenderer.tsx`: single entry point for SDUI widget schema registration, runtime `safeParse` validation, and graceful invalid-config fallback.
- `ui-react/src/components/widgets/containers/List.tsx` plus current `List` schema pattern: establishes the existing `data_source`-driven iteration model that chart widgets should mirror.
- `ui-react/package.json`: `recharts` is already installed, so Phase 10 can build on the existing dependency baseline without changing the charting foundation.
- Existing shared SDUI props and schema-first renderer approach documented in `docs/sdui/*` provide the contract shape chart widgets should extend.

### Established Patterns
- SDUI components are schema-first and must validate before render.
- Invalid widget configuration degrades inside the card instead of crashing the whole dashboard.
- Flow/backend owns auth, fetch, execution, normalization, and error classification; SDUI consumes already-normalized data.
- New widget families require docs, schema registry, and tests to evolve together.

### Integration Points
- Add new chart widget schemas and render branches to `ui-react/src/components/widgets/WidgetRenderer.tsx` and its adjacent widget modules.
- Consume normalized SQL output paths rooted in `sql_response.rows`, `sql_response.fields`, and related metadata from Phase 9.
- Extend SDUI docs/component map/spec alongside implementation so chart widget contracts become canonical authoring surface.
- Keep chart fallback states inside Bento Card rendering flow so dashboard layout/state ownership remains unchanged.

</code_context>

<specifics>
## Specific Ideas

- Public chart protocol should be designed for user intuition and common industry expectations, not as a thin mirror of Recharts props.
- Dataset selection should feel like the existing `List` authoring model: first choose `data_source`, then resolve `encoding` fields inside that dataset context.
- Chart loading states may differ by chart type, but empty/error/config-invalid semantics should remain deterministic at the card level.

</specifics>

<deferred>
## Deferred Ideas

- Advanced chart families beyond line/bar/area/pie/table (for example scatter, heatmap, composed charts) remain future work.
- Full-featured table/grid capabilities such as pagination, pinned headers, complex cell templates, and richer interaction remain out of Phase 10 scope.
- SQL preview UX, authoring assist, filter-to-query flows, and broader diagnostics hardening remain in Phase 11.

</deferred>

---

*Phase: 10-sql-chart-widgets-and-sdui-rendering*
*Context gathered: 2026-03-25*
