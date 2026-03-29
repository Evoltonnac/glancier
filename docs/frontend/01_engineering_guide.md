# Frontend Engineering Guide

Canonical frontend rules for `ui-react/`.

## Scope

- React UI implementation in `ui-react/src/`
- Data fetching and cache invalidation patterns
- Reliability rules for effects and runtime behavior

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- SWR
- Tauri v2 bridge

## Canonical Sources

- SDUI architecture: [`../sdui/01_architecture_and_guidelines.md`](../sdui/01_architecture_and_guidelines.md)
- Component taxonomy: [`../sdui/02_component_map_and_categories.md`](../sdui/02_component_map_and_categories.md)
- Template expression rules: [`../sdui/03_template_expression_spec.md`](../sdui/03_template_expression_spec.md)
- UI principles: [`../ui_design_guidelines.md`](../ui_design_guidelines.md)
- AI engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

## Data Fetching Standard

Use hooks from `ui-react/src/hooks/useSWR.ts` first.

Available hooks:

- `useSources()`
  - Default behavior returns source list + current cached detail map without forcing all detail requests.
  - Use `useSources({ withDetails: true })` only when a page explicitly needs eager full-detail hydration.
- `useSourceData(sourceId)`
- `useViews()`
- `useSettings()`
- `useIntegrationFiles()`
- `useIntegrationPresets()`
- `useIntegrationMetadata()`
- `useIntegrationFile(filename)`
- `useIntegrationSources(filename)`

Cache helpers:

- `invalidateSources()`
- `invalidateViews()`
- `invalidateSettings()`
- `invalidateIntegrationFiles()`
- `optimisticUpdateSources(...)`
- `updateSourcesSnapshot(...)`
- `optimisticRemoveSource(sourceId)`
- `optimisticUpdateSourceStatus(sourceId, status)`

## Source Update Coordinator Contract

Dashboard source updates are coordinated by `SourceUpdateCoordinator` (`ui-react/src/pages/sourceUpdateCoordinator.ts`).

Required behavior:

- Unified ingress: polling, websocket events, manual refresh, and dashboard view changes all submit into one coordinator queue.
- Source-level deduplication: one in-flight detail fetch per source.
- Priority scheduling:
  - Tier 1: active dashboard sources in card order.
  - Tier 2: other dashboard sources in dashboard order.
  - Tier 3: unreferenced sources.
- Bounded concurrency (default 4) with progressive UI update after each detail returns.
- Per-source detail throttle with leading + trailing semantics:
  - leading: first update in a burst fetches detail immediately.
  - trailing: updates within the throttle window are coalesced into one final fetch.
- Stale-result protection: older detail responses must not overwrite newer summary state.
- Summary/detail convergence: detail success can write summary-compatible fields (`status`, `error_code`, timestamps) back into the source list snapshot.

WebSocket contract:

- Event stream is lightweight (`source.updated`) and does not carry full detail payload.
- On websocket reconnect/history gap, frontend must trigger list reconciliation polling (`source.sync_required` path).
- HTTP remains the source of truth for detail payload retrieval.

## Effect Safety and StrictMode

React 18 StrictMode re-runs effects in development.

Rules:

- Always add cleanup for side effects.
- Guard one-time effects with a ref.
- Keep request/retry logic idempotent.

```tsx
const initializedRef = useRef(false);

useEffect(() => {
  if (initializedRef.current) return;
  initializedRef.current = true;

  // one-time side effect

  return () => {
    initializedRef.current = false;
  };
}, []);
```

## SWR + Zustand Sync Safety (Loop Prevention)

When mirroring SWR data into local zustand UI state, treat it as a derived sync path that must be idempotent.

Rules:

- Do not call zustand `set(...)` if the derived state is semantically unchanged.
- In store actions, return previous state for no-op branches (`set((state) => state)` semantics).
- In sync effects, avoid chaining extra setters after a store sync action that already computes and writes state.
- Never rely on array/object reference checks alone for network data (`data ?? []` patterns can create fresh references).
- Prefer one owner for reconciliation logic (store action), and keep component effects as thin triggers.

Recommended pattern:

```tsx
const EMPTY_VIEWS: StoredView[] = [];
const { views = EMPTY_VIEWS } = useViews();

// Store action does equality guard and decides whether to write.
useEffect(() => {
  syncWithViews(views);
}, [views, syncWithViews]);
```

Regression expectation:

- Add tests that cover no-op sync when SWR emits same-content data with new references.
- Verify no repeated render/update loops occur when views are empty or unchanged.

## Dashboard Management (Phase 06) Rules

Scope: `Dashboard.tsx`, `viewTabsState.ts`, dashboard management components.

- Keep `useViewTabsState` as the single owner of dashboard interaction state:
  - `viewMode`
  - `activeViewId`
  - `orderedViewIds`
  - `selectedDashboardId`
- Do not split dashboard ordering logic across multiple components. Reorder intent should funnel into store actions/helpers.
- Keep `Dashboard` page effects thin. Effects should trigger sync/invalidation, not duplicate reconciliation logic.
- Route dashboard layout persistence through `viewSaveQueue` and keep optimistic update + `invalidateViews()` reconciliation.
- Persist dashboard reorder through one backend call (`POST /api/views/reorder`) that updates `StoredView.sort_index` transactionally, then reconcile with `invalidateViews()`.
- Treat keys under `dashboard.tabs.*` and `dashboard.management.*` as stable contracts in i18n catalogs.
- Before shipping dashboard-management changes, run at least:
  - `DashboardViewTabs.test.tsx`
  - `DashboardViewOverflow.test.tsx`
  - `DashboardViewReorder.test.tsx`
  - `viewSaveQueue.test.ts`

## Multi-Panel Dashboard Feature Contract

This project supports a multi-panel dashboard experience with two operating modes:

- `single` mode:
  - render one active dashboard panel as the primary working surface
  - allow fast panel switching through tabs and overflow entries
- `management` mode:
  - render all dashboard panels as overview cards
  - support panel create, rename, delete, and reorder workflows

Behavior contracts:

- One canonical interaction-state owner must coordinate active panel, panel order, selected panel, and mode.
- Remote dashboard data and local interaction state must synchronize idempotently.
- Reorder/CRUD actions must persist through the same save/reconcile pipeline.
- User-facing panel interactions must keep i18n keys and backend `error_code` diagnostics stable.

Documentation and change policy:

- Any feature change affecting multi-panel behavior must update this section in the same delivery.
- Keep architecture-level behavior documented here, and avoid scattering competing contracts across multiple docs.

## API Client Notes

`ui-react/src/api/client.ts` owns backend calls and base URL resolution.

- Public API methods currently do not expose caller-level cancellation (`signal`).
- Add explicit `signal` plumbing in `ApiClient` before using cancellation in new paths.

## Integration Editor Diagnostics

Scope: Integration YAML editing and validation UX.

- Diagnostics must be severity-aware (`error` vs `warning`), not treated as a single blocking bucket.
- Unknown/additional parameter diagnostics should be presented as `warning` so users can keep iterating.
- Save interception (`Save` button and `Ctrl/Cmd+S`) must block only on `error` diagnostics.
- Runtime widget validation should tolerate extra widget parameters (ignore/drop extras) instead of failing card rendering only due unknown keys.

## Mutation Pattern

After create/update/delete:

1. call API method
2. apply optimistic update if needed
3. invalidate relevant SWR keys

Do not place business state transitions in purely presentational components.

Widget design principles:
- Keep declarative widgets parameter-driven: consume only declared widget params.
- Do not hardcode backend-specific field paths inside widget components (for example fixed `sql_response.*` reads).
- Workflow state and deterministic `error_code` diagnostics belong to source/card-level state handling, not chart widget internals.

## I18N Standard

Scope: all user-facing copy in `ui-react/src/`.

- Supported locales: `en` and `zh`.
- Default and fallback locale: `en`.
- UI-visible copy in app pages/components must use translation keys via `useI18n()`.
- Add every new key to both catalogs:
  - `ui-react/src/i18n/messages/en.ts`
  - `ui-react/src/i18n/messages/zh.ts`
- Key naming should be stable and domain-oriented (`settings.*`, `integrations.*`, `source.error.*`), not component-file-specific names.
- Language preference is backend-owned and persisted through `/api/settings` (`SystemSettings.language`).
- Standardized backend `error_code` should be mapped to localized, user-friendly copy when showing source/runtime errors.
- Do not collapse deterministic backend security/runtime codes into generic copy only.
  - Example: show dedicated localized copy for `script_sandbox_blocked` and `script_timeout_exceeded`.
  - Keep the stable code visible in diagnostics/details so users can report actionable failures.

## Documentation Policy

Keep long-lived frontend docs under `docs/`, not `ui-react/`.
