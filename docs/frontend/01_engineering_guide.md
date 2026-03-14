# Frontend Engineering Guide

This guide is the canonical frontend reference for `ui-react/`.

## Scope

- React UI implementation (`ui-react/src/`)
- Data fetching/state update conventions
- UI-facing reliability rules (StrictMode, effect safety)

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- SWR
- Tauri v2 bridge (desktop runtime)

## Canonical Sources

- SDUI architecture: [`../sdui/01_architecture_and_guidelines.md`](../sdui/01_architecture_and_guidelines.md)
- Component taxonomy: [`../sdui/02_component_map_and_categories.md`](../sdui/02_component_map_and_categories.md)
- Template expression rules: [`../sdui/03_template_expression_spec.md`](../sdui/03_template_expression_spec.md)
- UI principles: [`../ui_design_guidelines.md`](../ui_design_guidelines.md)
- AI engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

## Data Fetching Standard

Use `ui-react/src/hooks/useSWR.ts` hooks first.

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

Cache invalidation helpers:

- `invalidateSources()`
- `invalidateViews()`
- `invalidateSettings()`
- `invalidateIntegrationFiles()`
- `optimisticUpdateSources(...)`
- `optimisticRemoveSource(sourceId)`
- `optimisticUpdateSourceStatus(sourceId, status)`

## Effect Safety and StrictMode

React 18 StrictMode intentionally re-runs effects in development.

Rules:

- Always add cleanup in `useEffect` when side effects can leak.
- For one-time side effects, guard with a ref flag.
- Keep idempotency for request/retry flows.

Example pattern:

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

## API Client Notes

`ui-react/src/api/client.ts` centralizes backend calls and runtime base URL resolution.

Current constraint:

- Public API methods do not expose caller-level request cancellation (`signal`) for general usage.
- If cancellation is required for a new path, add explicit `signal` plumbing in `ApiClient` first.

## Mutation Pattern

After create/update/delete operations:

1. call API method
2. apply optimistic update if needed
3. invalidate the relevant SWR cache key(s)

Do not couple business state transitions to pure presentational components.

## Documentation Policy

Frontend documentation belongs under `docs/`.
Do not add long-lived engineering guidance under `ui-react/`.
