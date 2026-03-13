# Testing Patterns

**Analysis Date:** 2026-03-13

## Test Framework

**Runner:**
- Vitest v4.0.0
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in expect
- @testing-library/jest-dom v6.9.1 (DOM assertions)
- @testing-library/react v16.3.0 (React testing utilities)

**Run Commands:**
```bash
npm test                    # Run all tests with watch mode
npm run test:core           # Run core tests only (non-watch)
```

## Test File Organization

**Location:**
- Co-located with source files: `src/**/*.test.{ts,tsx}`
- E2E tests: `tests/e2e/test_ui.spec.ts`

**Naming:**
- `*.test.ts` for TypeScript unit tests
- `*.test.tsx` for React component tests
- `test_ui.spec.ts` for Playwright E2E tests

**Structure:**
```
src/
├── api/
│   └── client.test.ts      # API client tests
├── store/
│   └── index.test.ts       # Zustand store tests
├── hooks/
│   ├── useScraper.test.ts  # Custom hook tests
│   └── useSWR.ts           # (no test)
├── pages/
│   ├── dashboardLayout.test.ts    # Layout utility tests
│   ├── Integrations.test.tsx      # Page component tests
│   └── *.tsx               # (other pages lack tests)
├── components/
│   ├── auth/
│   │   ├── DeviceFlowModal.test.tsx
│   │   ├── OAuthCallback.test.tsx
│   │   └── FlowHandler.test.tsx
│   ├── widgets/
│   │   └── WidgetRenderer.test.tsx
│   └── ui/
│       ├── MetricCard.test.tsx
│       └── BentoWidget.test.tsx
└── test/
    ├── setup.ts            # Global test setup
    ├── mocks/
    │   └── tauri.ts        # Tauri API mocks
    └── render.tsx          # Custom render utility
```

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("store", () => {
    const initialState = useStore.getState();

    beforeEach(() => {
        useStore.setState(initialState, true);
        // Reset mocks
    });

    it("toggles sidebar state", () => {
        expect(useStore.getState().sidebarCollapsed).toBe(false);
        useStore.getState().toggleSidebar();
        expect(useStore.getState().sidebarCollapsed).toBe(true);
    });
});
```

**Patterns:**
- Use `describe` blocks for grouping related tests
- Use `beforeEach` for test setup and state reset
- Use `afterEach` for cleanup (e.g., `vi.useRealTimers()`)
- Get initial state at top level: `const initialState = useStore.getState()`

## Mocking

**Framework:** Vitest (vi.fn(), vi.hoisted(), vi.mock())

**Patterns:**

### 1. Module mocking with vi.hoisted()
```typescript
const { apiMock } = vi.hoisted(() => ({
    apiMock: {
        getViews: vi.fn(),
        getSources: vi.fn(),
        getSourceData: vi.fn(),
    },
}));

vi.mock("../api/client", () => ({
    api: apiMock,
}));
```

### 2. Global mocks in setup file (`src/test/setup.ts`)
```typescript
vi.mock("@tauri-apps/api/core", () => ({
    invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
    listen: mockListen,
}));
```

### 3. Mocking library utilities
```typescript
vi.mock("../lib/utils", () => ({
    isTauri: () => true,
}));
```

### 4. Fetch mocking for API tests
```typescript
vi.stubGlobal("fetch", vi.fn());
const fetchMock = vi.mocked(fetch);
fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ data: 42 }),
} as unknown as Response);
```

### 5. Timer mocking
```typescript
vi.useFakeTimers();
// ... test code
vi.useRealTimers();
```

**What to Mock:**
- External APIs (Tauri invoke, fetch)
- Browser APIs (matchMedia)
- Complex dependencies (API client)
- Timer-based logic (setTimeout, setInterval)

**What NOT to Mock:**
- Zustand store (use store.getState() and setState() directly)
- Simple utility functions being tested

## Fixtures and Factories

**Test Data:**
```typescript
function buildWebviewSource(id: string, name: string): SourceSummary {
    return {
        id,
        name,
        description: `${name} source`,
        enabled: true,
        auth_type: "oauth",
        has_data: false,
        status: "suspended",
        interaction: {
            type: "webview_scrape",
            step_id: "webview",
            message: "Need webview scraping",
            fields: [],
            data: { /* ... */ },
        },
    };
}
```

**Location:**
- Factory functions defined at top of test files
- Mock data defined inline in tests

## Coverage

**Requirements:** No enforced coverage target

**View Coverage:**
```bash
npm test -- --coverage    # If coverage is enabled
```

## Test Types

**Unit Tests:**
- Focus on pure functions: `dashboardLayout.test.ts` tests `hasLayoutOverlap`, `mergeViewItemsWithGridNodes`
- State management: `store/index.test.ts` tests Zustand actions
- API client: `client.test.ts` tests HTTP error handling, response parsing
- Custom hooks: `useScraper.test.ts` tests React hook behavior

**Integration Tests:**
- Store + API mocking: tests loadData flow
- Hook + Store: tests useScraper queue management

**E2E Tests:**
- Framework: Playwright v1.58.2
- Location: `tests/e2e/test_ui.spec.ts`
- Uses page.route() to mock all API responses
- Tests complete user flows: dashboard rendering, integration creation, settings

```typescript
test.beforeEach(async ({ page }) => {
    await page.route("**/*", async (route) => {
        // Mock all API endpoints
    });
});

test("dashboard renders mocked source statuses", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("监控视图")).toBeVisible();
});
```

## Common Patterns

**Async Testing:**
```typescript
// With act() for React state updates
await act(async () => {
    await result.current.handleShowScraperWindow();
});

// With fake timers
vi.useFakeTimers();
await act(async () => {
    vi.advanceTimersByTime(11_000);
    await Promise.resolve();
});
```

**Error Testing:**
```typescript
await expect(api.getSourceData("missing-source")).resolves.toBeNull();
await expect(api.refreshSource("foo/bar")).rejects.toThrow("integration missing");
```

**State Testing:**
```typescript
const initialState = useStore.getState();
beforeEach(() => {
    useStore.setState(initialState, true);
});
// Test mutations and verify new state
```

**Component Testing:**
```typescript
import { render } from "../test/render";
import { MyComponent } from "./MyComponent";

it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("expected")).toBeInTheDocument();
});
```

---

*Testing analysis: 2026-03-13*
