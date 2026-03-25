# Phase 10: SQL Chart Widgets and SDUI Rendering - Research

**Researched:** 2026-03-25
**Domain:** SQL-backed chart widgets in a schema-first SDUI renderer
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact internal adapter structure between SDUI chart schemas and Recharts components, as long as the public chart protocol stays library-agnostic.
- Precise split between shared chart base schema and per-chart schema extensions, as long as the user-facing contract stays coherent and minimal.
- Exact visual design of each chart-specific loading placeholder.
- Exact wording/layout of empty/config-error/runtime-error chart states, as long as they remain deterministic and non-crashing.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Advanced chart families beyond line/bar/area/pie/table (for example scatter, heatmap, composed charts) remain future work.
- Full-featured table/grid capabilities such as pagination, pinned headers, complex cell templates, and richer interaction remain out of Phase 10 scope.
- SQL preview UX, authoring assist, filter-to-query flows, and broader diagnostics hardening remain in Phase 11 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHART-01 | User can render SQL-backed line charts in Bento Cards. | Shared `data_source` + `encoding` contract, Recharts line composition pattern, card-scoped fallback architecture. |
| CHART-02 | User can render SQL-backed bar charts in Bento Cards. | Same adapter pattern as line charts, chart-specific schema extension for bar semantics, shared fallback shell. |
| CHART-03 | User can render SQL-backed area charts in Bento Cards. | Same adapter pattern as line/bar, area-specific renderer with shared encoding validation. |
| CHART-04 | User can render SQL-backed pie charts in Bento Cards. | Pie-specific `label` + `value` encoding, donut support via internal radius prop, zero/legend pitfalls documented. |
| CHART-05 | User can render SQL-backed tabular views as a chart-compatible widget for dense result inspection. | `Chart.Table` schema extension, field-aware columns, frontend-only sorting/limiting over normalized `rows`. |
| CHART-06 | User can rely on deterministic empty/loading/error fallback states for all new chart widgets. | Explicit state machine per widget, validated config-error vs runtime-error vs empty-state rendering inside stable card shell. |
| CHART-07 | User can configure x/y/series/value field mapping from normalized Integration Data with runtime schema validation. | Zod discriminated union schemas, field existence/type validation against `sql_response.fields`, adapter layer isolated from renderer library. |
</phase_requirements>

## Summary

Phase 10 should be implemented as a schema-first chart subsystem that mirrors the existing `WidgetRenderer` pattern: resolve template expressions first, validate with Zod second, then render through a thin internal adapter. The public SDUI API must stay library-agnostic and should standardize on `data_source + encoding` rather than passing raw Recharts props through templates. This matches the project’s existing SDUI discipline, preserves the backend/frontend boundary from Phases 8-9, and gives deterministic config-error behavior instead of implicit chart recovery.

Internally, Recharts remains the right implementation engine for this phase because it is already present in the repo and supports the needed chart families. However, the repo is on Recharts `2.15.0`, while current npm is `3.8.0` (published 2026-03-06). Recharts 3 introduced newer responsive patterns and pie interaction changes, so Phase 10 should not couple its public contract to Recharts APIs and should not take on a renderer upgrade unless explicitly split into separate migration work.

The main unknown that can cause rewrites is not chart drawing itself; it is data-contract enforcement. The high-value work is validating `encoding` against normalized `sql_response.rows` plus `sql_response.fields`, classifying chart states deterministically, and keeping chart rendering inside the Bento card shell so bad data never crashes the dashboard. Treat charts as render-only consumers of normalized SQL data, never as places to infer business logic or repair broken upstream responses.

**Primary recommendation:** Build a shared `ChartBaseSchema` + `ChartRuntimeAdapter` around `data_source` and validated `encoding`, keep Recharts internal, and make every chart widget render through the same deterministic state classifier before any chart library component mounts.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | 2.15.0 in repo; latest npm 3.8.0 (2026-03-06) | Internal chart renderer for line/bar/area/pie | Already installed, covers required chart families, official responsive container patterns, tooltip/legend primitives. |
| Zod | 4.3.6 (2026-01-22) | Runtime validation for chart widget schemas and encoding rules | Already used in `WidgetRenderer`; `safeParse` + discriminated unions fit schema-first SDUI. |
| React | 18.3.1 | Widget composition and fallback rendering | Existing renderer baseline; no phase-specific change needed. |
| Vitest | 4.0.0 in repo; latest npm 4.1.1 (2026-03-23) | Frontend regression testing | Existing jsdom-based component testing already covers `WidgetRenderer`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Testing Library React | 16.3.0 | Assert chart fallback and validation behavior in DOM | Use for all widget rendering and state tests. |
| Existing template expression engine | repo-local | Resolve `data_source`, titles, and format props before validation | Use before schema validation, same as current SDUI widgets. |
| Existing `BaseSourceCard` shell | repo-local | Preserve stable Bento card structure and no-data shell behavior | Use for all chart fallback states so cards never white-screen. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Internal Recharts adapter | Direct Recharts props in SDUI | Faster short-term, but violates locked library-agnostic public contract. |
| Shared `encoding` contract | Per-chart ad hoc props (`x_field`, `y_field`, etc.) | Easier per widget, but fragments authoring model and increases validation drift. |
| Runtime field validation against `sql_response.fields` | Best-effort render from raw rows only | Simpler code, but causes silent bad charts and unstable fallbacks. |
| Recharts 2.15.0 baseline for this phase | Upgrade to Recharts 3.x now | Gains newer responsive APIs, but adds migration risk unrelated to Phase 10 requirements. |

**Installation:**
```bash
# No new chart library is required for Phase 10.
# Keep the existing frontend baseline unless a separate migration is approved.
npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react install
```

**Version verification:**
```bash
npm view recharts version
npm view zod version
npm view vitest version
```

Verified current npm versions and publish dates on 2026-03-25:
- `recharts`: `3.8.0` — published `2026-03-06T21:58:48.207Z`
- `zod`: `4.3.6` — published `2026-01-22T19:14:35.382Z`
- `vitest`: `4.1.1` — published `2026-03-23T14:58:50.811Z`

Repository baseline differs for Recharts and Vitest. Because project rules discourage opportunistic core upgrades, Phase 10 should implement against the existing installed versions and keep the public contract migration-safe.

## Architecture Patterns

### Recommended Project Structure
```text
ui-react/src/components/widgets/
├── WidgetRenderer.tsx                 # extend discriminated union + switch
├── shared/
│   ├── chartSchemas.ts                # shared chart base schema + encoding schemas
│   ├── chartFieldValidation.ts        # validate encoding against sql_response.fields
│   ├── chartState.ts                  # loading/empty/config/runtime state classifier
│   └── chartFormatting.ts             # deterministic display helpers only
├── charts/
│   ├── ChartLine.tsx                  # schema + renderer adapter
│   ├── ChartBar.tsx                   # schema + renderer adapter
│   ├── ChartArea.tsx                  # schema + renderer adapter
│   ├── ChartPie.tsx                   # schema + renderer adapter
│   ├── ChartTable.tsx                 # schema + renderer adapter
│   ├── ChartFrame.tsx                 # shared title/legend/state shell inside card content
│   └── adapters/
│       └── rechartsAdapter.tsx        # only place that knows Recharts component mapping
└── __tests__/
    ├── chartSchemas.test.ts
    ├── chartState.test.ts
    ├── ChartWidgets.test.tsx
    └── ChartTable.test.tsx
```

### Pattern 1: Shared chart base schema plus per-chart discriminated extensions
**What:** Define one shared chart schema for `data_source`, `encoding`, shared display props, and fallback props, then extend it per chart type with a discriminated union keyed by `type`.

**When to use:** For all five chart widgets. This matches the current `WidgetRenderer` union architecture and keeps runtime validation centralized.

**Example:**
```typescript
// Source: https://zod.dev/?id=discriminated-unions
const ChartBaseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  data_source: z.array(z.record(z.any())),
  encoding: z.record(z.any()),
  legend: z.boolean().default(false),
  colors: z.array(z.string()).optional(),
  empty_state: z.string().optional(),
});

const ChartWidgetSchema = z.discriminatedUnion("type", [
  ChartBaseSchema.extend({ type: z.literal("Chart.Line"), encoding: LineEncodingSchema }),
  ChartBaseSchema.extend({ type: z.literal("Chart.Bar"), encoding: CartesianEncodingSchema }),
  ChartBaseSchema.extend({ type: z.literal("Chart.Area"), encoding: CartesianEncodingSchema }),
  ChartBaseSchema.extend({ type: z.literal("Chart.Pie"), encoding: PieEncodingSchema, donut: z.boolean().default(false) }),
  ChartBaseSchema.extend({ type: z.literal("Chart.Table"), columns: z.array(TableColumnSchema).optional() }),
]);
```

### Pattern 2: Resolve templates first, validate second, render last
**What:** Preserve the current SDUI order already implemented in `WidgetRenderer`: template resolution happens before `safeParse`, and invalid evaluated values render an inline fallback.

**When to use:** Every chart widget render path. This is critical for templated `data_source`, `legend`, `format`, and enum props.

**Example:**
```typescript
// Source: local pattern in ui-react/src/components/widgets/WidgetRenderer.tsx
const evaluatedWidget = resolveWidgetParams(widget, data);
const parsed = RuntimeChartWidgetSchema.safeParse(evaluatedWidget);

if (!parsed.success) {
  return <ChartConfigErrorCard issues={parsed.error.issues} />;
}

return <ChartRuntimeAdapter widget={parsed.data} data={data} />;
```

### Pattern 3: Validate encoding against `sql_response.fields`, not just row objects
**What:** Use normalized field metadata as the contract authority for field existence and type checks, with row sampling only as a secondary guard.

**When to use:** For `x`, `y`, `series`, `label`, `value`, and table column references.

**Example:**
```typescript
// Source: Phase 9 contract in docs/flow/02_step_reference.md
function validateEncodingAgainstSqlFields(fields, encoding, chartType) {
  const fieldIndex = new Map(fields.map((field) => [field.name, field]));

  for (const channel of requiredChannelsFor(chartType)) {
    const selected = encoding[channel];
    if (!selected || !fieldIndex.has(selected.field)) {
      return { ok: false, kind: "config_error", channel };
    }
  }

  return { ok: true };
}
```

### Pattern 4: One deterministic chart state classifier before renderer mount
**What:** Convert all upstream conditions into a small explicit state machine: `loading`, `runtime_error`, `config_error`, `empty`, `ready`.

**When to use:** Before rendering any chart library component.

**Example:**
```typescript
function classifyChartState(sourceSummary, dataset, encodingValidation) {
  if (sourceSummary?.status === "refreshing") return { kind: "loading" };
  if (sourceSummary?.status === "error") return { kind: "runtime_error" };
  if (!encodingValidation.ok) return { kind: "config_error", detail: encodingValidation };
  if (!Array.isArray(dataset) || dataset.length === 0) return { kind: "empty" };
  return { kind: "ready" };
}
```

### Pattern 5: Isolate all Recharts knowledge inside adapters
**What:** The adapter converts SDUI chart contracts into Recharts components and props. No SDUI schema should expose `dataKey`, `innerRadius`, `syncId`, `ResponsiveContainer`, or other library-specific terms directly unless intentionally mapped to a library-agnostic concept.

**When to use:** All renderer internals.

**Example:**
```typescript
// Source: https://recharts.github.io/en-US/api/LineChart and /api/Pie
function RechartsLineAdapter({ rows, encoding, legend }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows}>
        <XAxis dataKey={encoding.x.field} />
        <YAxis />
        {legend ? <Legend /> : null}
        <Tooltip />
        <Line type="monotone" dataKey={encoding.y.field} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Anti-Patterns to Avoid
- **Passing Recharts props through SDUI:** Makes the public contract impossible to keep stable across library upgrades.
- **Inferring channels from first row automatically:** Creates nondeterministic behavior when row order or nullability changes.
- **Rendering empty chart chrome for empty datasets:** Violates the locked decision to show unified empty-state cards.
- **Using chart widgets to transform business data:** Breaks the backend/render-only boundary from prior phases.
- **Mounting chart library components before validation:** Risks runtime exceptions, zero-height layouts, and white-screen behavior.
- **Mixing config-error and runtime-error semantics:** The planner must keep these distinct for deterministic diagnostics later in Phase 11.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG chart primitives | Custom SVG line/bar/pie renderer | Recharts internal adapter | Axes, legends, tooltips, sector math, resize handling, and interaction edge cases are already solved. |
| Runtime schema/error plumbing | Ad hoc `if` chains | Zod `safeParse` + discriminated unions | Produces stable error paths/messages and matches existing `WidgetRenderer` design. |
| Tooltip/legend layout behavior | Custom floating overlays | Recharts `Tooltip` and `Legend` | ViewBox escape, portal rendering, shared/axis tooltip semantics are already implemented. |
| Responsive resize detection | Manual window resize listeners | `ResponsiveContainer` on Recharts 2.x | Officially supported container sizing avoids homegrown ResizeObserver bugs. |
| SQL field-type inference in frontend | Guess from rows only | Phase 9 `sql_response.fields` metadata | Rows alone lose precision for null-heavy or stringified serialized values. |
| Table sorting/filter rules | Complex data-grid subsystem | Minimal deterministic sort/limit over normalized rows | Phase 10 scope is chart-compatible dense inspection, not full grid product behavior. |

**Key insight:** The expensive mistakes in this domain are not drawing shapes; they are hidden state contracts, field-type drift, and fallback inconsistencies. Reuse the existing renderer/validation architecture and only add the minimal adapter layer.

## Common Pitfalls

### Pitfall 1: Parent container has no real height, so chart renders at zero or unstable size
**What goes wrong:** Recharts responsive charts fail to size correctly when the parent container does not have explicit dimensions.
**Why it happens:** Official docs say `ResponsiveContainer` sizes relative to its parent and uses `ResizeObserver`; if the parent has no real size, the chart cannot resolve layout.
**How to avoid:** Give the chart frame a stable card content area with explicit height semantics (`h-full min-h-0`) and keep the actual chart inside that bounded region.
**Warning signs:** Chart invisible despite valid data; resize glitches in flex/grid layouts; charts suddenly expand or collapse.

### Pitfall 2: Recharts 3.x advice leaks into a Recharts 2.x codebase
**What goes wrong:** Implementers follow current docs that recommend the chart-level `responsive` prop, but the repo still ships Recharts 2.15.0.
**Why it happens:** SOTA docs now prefer chart-level responsiveness in 3.3+, while this project baseline predates that API.
**How to avoid:** For Phase 10, standardize on `ResponsiveContainer` internally and keep public SDUI contracts free of renderer-specific responsive API decisions.
**Warning signs:** Use of `responsive` prop appears in implementation or tests without a planned Recharts upgrade.

### Pitfall 3: Invalid encoding silently produces misleading charts
**What goes wrong:** Wrong field names, wrong channel types, or missing required channels still render something, but it is semantically wrong.
**Why it happens:** Row objects are permissive and chart libraries often fail softly.
**How to avoid:** Validate channel presence, field existence, and allowed type classes before any renderer mounts. Use `sql_response.fields` as the authority.
**Warning signs:** Empty axes with non-empty data, legend labels as `undefined`, pie sectors collapsed to nothing, or tooltips with wrong labels.

### Pitfall 4: Pie zero values and legend behavior are misunderstood
**What goes wrong:** Users expect zero-value sectors to render visibly or `minAngle` to force them visible.
**Why it happens:** Official Pie docs note `minAngle` applies only to nonzero data, and legend names derive from `nameKey`/`dataKey` wiring.
**How to avoid:** Treat all-zero pie data as `empty` or `config_error` according to business rule; document that zero sectors are not a visibility guarantee.
**Warning signs:** Pie chart shows no sectors while legend still renders entries; donut appears blank with valid labels but zero values.

### Pitfall 5: Tooltip behavior causes nondeterministic card overflow
**What goes wrong:** Tooltips clip awkwardly or escape unexpectedly, especially inside dense Bento grids.
**Why it happens:** Tooltip rendering depends on chart wrapper/viewBox rules unless configured with `allowEscapeViewBox`, `portal`, or fixed `position`.
**How to avoid:** Keep a consistent default tooltip strategy per chart family and only opt into escaping/portal behavior deliberately.
**Warning signs:** Tooltip clipped by card body, overlapping unrelated cards, or differing placement between environments.

### Pitfall 6: Loading, empty, config-error, and runtime-error are conflated
**What goes wrong:** A missing dataset, a broken field mapping, and an upstream SQL failure all show the same UI.
**Why it happens:** It is tempting to reuse one generic "no chart" component.
**How to avoid:** Make the state classifier explicit and test each state independently.
**Warning signs:** Hard-to-debug authoring failures, non-actionable user messages, or dashboards that appear blank without reason.

### Pitfall 7: Chart widgets start doing data transformation work
**What goes wrong:** Frontend code begins grouping, coercing, or repairing SQL results beyond lightweight render shaping.
**Why it happens:** Grouped series and table formatting can tempt implementers into business-logic transforms.
**How to avoid:** Limit frontend work to deterministic render adaptation: grouping by selected `series`, sorting for table display, and display formatting only.
**Warning signs:** Widget-specific domain logic, connector-aware branches, or duplicated normalization rules already defined in Phase 9.

## Code Examples

Verified patterns from official sources and existing project architecture:

### Responsive line chart composition
```typescript
// Source: https://recharts.github.io/en-US/api/ResponsiveContainer
// Source: https://recharts.github.io/en-US/api/LineChart
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={rows}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey={encoding.x.field} />
    <YAxis />
    <Tooltip />
    <Legend />
    <Line type="monotone" dataKey={encoding.y.field} />
  </LineChart>
</ResponsiveContainer>
```

### Pie or donut chart mapping
```typescript
// Source: https://recharts.github.io/en-US/api/Pie/
<ResponsiveContainer width="100%" height="100%">
  <PieChart>
    <Tooltip />
    <Legend />
    <Pie
      data={rows}
      dataKey={encoding.value.field}
      nameKey={encoding.label.field}
      innerRadius={donut ? 48 : 0}
      label
    />
  </PieChart>
</ResponsiveContainer>
```

### Safe runtime validation without exceptions
```typescript
// Source: https://zod.dev/basics
const parsed = ChartWidgetSchema.safeParse(evaluatedWidget);

if (!parsed.success) {
  return <ChartConfigErrorCard issues={parsed.error.issues} />;
}

return <ChartRuntimeAdapter widget={parsed.data} />;
```

### Discriminated union for widget types
```typescript
// Source: https://zod.dev/?id=discriminated-unions
const ChartWidgetSchema = z.discriminatedUnion("type", [
  ChartLineSchema,
  ChartBarSchema,
  ChartAreaSchema,
  ChartPieSchema,
  ChartTableSchema,
]);
```

### Project-aligned parameter resolution before parse
```typescript
// Source: local pattern in ui-react/src/components/widgets/shared/widgetParamResolver.ts
const evaluatedWidget = resolveWidgetParams(widget, data);
const parsed = RuntimeChartWidgetSchema.safeParse(evaluatedWidget);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts responsiveness via `ResponsiveContainer` everywhere | Recharts 3.3+ recommends chart-level `responsive` prop as the preferred pattern | Recharts 3.3+ docs | Current ecosystem guidance is newer than this repo baseline; Phase 10 should keep responsiveness internal and migration-safe. |
| Pie interaction examples using older `activeIndex` patterns | Recharts 3 migration guidance removed older pie active-index patterns | Recharts 3.x migration era | Do not design SDUI contract around outdated pie interaction APIs. |
| Ad hoc runtime validation or thrown parse errors | `safeParse`-driven schema validation with structured issues | Current Zod 4 docs | Better fit for deterministic chart config fallbacks and issue-path reporting. |
| Raw row guessing for frontend chart fields | Stable normalized `sql_response.fields` metadata from backend | Phase 9 completion | Chart mapping should validate against canonical field metadata, not inference. |

**Deprecated/outdated:**
- Treating charts as renderer-specific config blobs: replaced by library-agnostic SDUI chart schemas.
- Treating frontend charts as data repair/transformation layers: replaced by backend-owned normalization plus frontend render-only adaptation.
- Assuming latest Recharts docs always match the installed repo version: false in this codebase today.

## Open Questions

1. **Should Phase 10 stay on Recharts 2.15.0 or include a Recharts 3 migration?**
   - What we know: Recharts 3.8.0 is current, but repo baseline is 2.15.0 and project rules discourage casual core upgrades.
   - What's unclear: Whether any required Phase 10 behavior is blocked by 2.15.0.
   - Recommendation: Keep 2.15.0 for Phase 10 unless implementation hits a concrete blocker; if so, split upgrade into explicit migration work.

2. **What exact field-type taxonomy does Phase 9 expose in `sql_response.fields` for frontend validation?**
   - What we know: Phase 9 locked typed field metadata and deterministic serialization.
   - What's unclear: Exact frontend type buckets to enforce for cartesian numeric channels versus categorical channels.
   - Recommendation: Wave 0 should codify a narrow frontend type-class mapper (`numeric`, `temporal`, `categorical`) based on existing metadata.

3. **How should grouped `series` data be shaped for Recharts internally?**
   - What we know: Public authoring model is `data_source + encoding`, and grouped series are in first-release scope.
   - What's unclear: Whether the adapter pivots rows per x-value or renders one primitive per distinct series value from raw rows.
   - Recommendation: Use a dedicated adapter function with tests for repeated x-values, nulls, and sparse series; keep that transformation internal only.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.0 in repo (`latest npm: 4.1.1`) + Testing Library React |
| Config file | `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/vitest.config.ts` |
| Quick run command | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/WidgetRenderer.test.tsx --run` |
| Full suite command | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test:core` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHART-01 | Render SQL-backed line widget from normalized rows | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders line chart from sql_response rows"` | ❌ Wave 0 |
| CHART-02 | Render SQL-backed bar widget | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders bar chart from sql_response rows"` | ❌ Wave 0 |
| CHART-03 | Render SQL-backed area widget | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders area chart from sql_response rows"` | ❌ Wave 0 |
| CHART-04 | Render SQL-backed pie/donut widget | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders pie chart from sql_response rows"` | ❌ Wave 0 |
| CHART-05 | Render table widget with column selection/sorting/limit | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartTable.test.tsx --run` | ❌ Wave 0 |
| CHART-06 | Deterministic loading/empty/config-error/runtime-error fallbacks | component + unit | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartState.test.tsx --run` | ❌ Wave 0 |
| CHART-07 | Runtime schema validation for encoding mappings | unit + component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/chartSchemas.test.ts src/components/widgets/ChartWidgets.test.tsx --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/WidgetRenderer.test.tsx --run`
- **Per wave merge:** `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test:core`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/ChartWidgets.test.tsx` — chart render/fallback coverage for CHART-01..04 and CHART-06
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/ChartTable.test.tsx` — table sorting/limit/column coverage for CHART-05
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/chartSchemas.test.ts` — encoding validation coverage for CHART-07
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/chartState.test.ts` — deterministic state classifier coverage for CHART-06
- [ ] Add chart widgets to existing `WidgetRenderer.test.tsx` regression path once registry wiring lands

## Sources

### Primary (HIGH confidence)
- Local code: `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/WidgetRenderer.tsx` — current schema-first validation and graceful fallback pattern
- Local code: `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/shared/widgetParamResolver.ts` — template resolution ordering
- Local code: `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/BaseSourceCard.tsx` — stable card shell and no-data behavior
- Official docs: https://recharts.github.io/en-US/api/ResponsiveContainer — parent sizing, ResizeObserver, min dimensions
- Official docs: https://recharts.github.io/en-US/api/LineChart — line chart composition, sync behavior
- Official docs: https://recharts.github.io/en-US/api/Pie/ — pie data shape, `dataKey`, `nameKey`, `innerRadius`, zero-value caveat context
- Official docs: https://recharts.github.io/en-US/api/Tooltip/ — tooltip SSR animation default and positioning/escape props
- Official docs: https://recharts.github.io/en-US/guide/sizes/ — current responsive sizing guidance
- Official docs: https://zod.dev/basics — `parse` vs `safeParse`, `ZodError.issues`, inference
- Official docs: https://zod.dev/?id=discriminated-unions — discriminated union behavior and expectations
- Project contract: `/Users/xingminghua/Coding/evoltonnac/glanceus/docs/flow/02_step_reference.md` — canonical `sql_response` envelope

### Secondary (MEDIUM confidence)
- npm registry metadata for version verification: `recharts@3.8.0`, `zod@4.3.6`, `vitest@4.1.1`
- GitHub issue: https://github.com/recharts/recharts/issues/4519 — parent-height/responsiveness pitfall corroboration
- GitHub issue: https://github.com/recharts/recharts/issues/5388 — container sizing feedback-loop pitfall corroboration
- GitHub issue: https://github.com/recharts/recharts/issues/4487 — responsive pie + legend layout pressure corroboration
- Recharts migration wiki: https://github.com/recharts/recharts/wiki/3.0-migration-guide — outdated pie interaction guidance warning

### Tertiary (LOW confidence)
- GitHub issue: https://github.com/recharts/recharts/issues/3688 — older responsive-container layout issue, useful but version-sensitive
- Stack Overflow: https://stackoverflow.com/questions/50891591/recharts-responsive-container-does-not-resize-correctly-in-flexbox — common flexbox symptom reference only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - local repo baseline and npm registry versions were directly verified; official Recharts/Zod docs confirm core APIs.
- Architecture: MEDIUM - strongly grounded in current local widget architecture and official library docs, but exact grouped-series adapter shape still needs implementation-level validation.
- Pitfalls: MEDIUM - major sizing/pie/tooltip pitfalls are supported by official docs plus ecosystem issue history, but some issue-specific behavior is version-sensitive.

**Research date:** 2026-03-25
**Valid until:** 2026-04-24