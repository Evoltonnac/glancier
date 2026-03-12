# Frontend Development Guidelines

## React Data Fetching

### Recommended: Use SWR Hooks

For data that needs caching, background refresh, and automatic deduplication:

```tsx
import { useSources, useSettings } from "../hooks/useSWR";

// Automatically handles dedup, caching, and StrictMode
const { sources, isLoading } = useSources();
const { settings } = useSettings();
```

Available hooks in `src/hooks/useSWR.ts`:
- `useSources()` - Get all data sources
- `useSourceData(id)` - Get single source data
- `useViews()` - Get all views
- `useSettings()` - Get system settings
- `useIntegrationFiles()` - Get integration file list
- `useIntegrationPresets()` - Get integration presets
- `useIntegrationFile(filename)` - Get integration file content
- `useIntegrationSources(filename)` - Get sources related to an integration

### Manual Fetch with AbortController

When you need manual control or the API doesn't support SWR:

```tsx
useEffect(() => {
  const controller = new AbortController();

  async function fetchData() {
    try {
      const data = await api.getData({ signal: controller.signal });
      // Handle data...
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
  }

  fetchData();

  // Cleanup: abort when component unmounts or StrictMode re-runs
  return () => controller.abort();
}, [deps]);
```

**Note:** Currently, the API client (`src/api/client.ts`) does not support AbortController. For simple one-time operations, use the ref pattern below.

### One-Time Operations (No API Abort Support)

For operations that run once and don't support abort (like OAuth callbacks):

```tsx
const callbackRef = useRef(false);

useEffect(() => {
  if (callbackRef.current) return;
  callbackRef.current = true;

  // One-time logic...

  return () => {
    callbackRef.current = false;
  };
}, []);
```

## StrictMode Prevention

React 18's StrictMode intentionally double-invokes in development:
- Component functions
- `useEffect` callbacks
- `useState` initializers

Always use one of the patterns above to prevent duplicate side effects.

## Error Handling

```tsx
// SWR provides error state
const { data, isLoading, isError } = useSources();

if (isLoading) return <Skeleton />;
if (isError) return <ErrorMessage error={isError} />;
```

## Mutations

After creating/updating/deleting data, invalidate the cache:

```tsx
import { mutate } from "swr";

// After successful mutation
await api.createItem(data);
mutate("items"); // Refetch items
```
