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
- `optimisticRemoveSource(sourceId)`
- `optimisticUpdateSourceStatus(sourceId, status)`

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

## API Client Notes

`ui-react/src/api/client.ts` owns backend calls and base URL resolution.

- Public API methods currently do not expose caller-level cancellation (`signal`).
- Add explicit `signal` plumbing in `ApiClient` before using cancellation in new paths.

## Mutation Pattern

After create/update/delete:

1. call API method
2. apply optimistic update if needed
3. invalidate relevant SWR keys

Do not place business state transitions in purely presentational components.

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
