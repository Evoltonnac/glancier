# Coding Conventions

**Analysis Date:** 2026-03-13

## Naming Patterns

**Files:**
- PascalCase for components: `Dashboard.tsx`, `WidgetRenderer.tsx`
- camelCase for utilities/hooks: `useScraper.ts`, `templateExpression.ts`
- camelCase for test files: `dashboardLayout.test.ts`, `useScraper.test.ts`
- kebab-case for config files: `eslint.config.js`, `vitest.config.ts`

**Functions:**
- camelCase: `useScraper`, `mergeViewItemsWithGridNodes`, `hasLayoutOverlap`
- Custom hooks MUST start with "use" prefix: `useScraper`, `useSidebar`, `useSWR`

**Variables:**
- camelCase: `activeScraper`, `webviewQueue`, `scraperLogs`
- Interface names use PascalCase: `AppState`, `ScraperLifecycleLog`, `SourceSummary`
- Type aliases use PascalCase: `WaitForBackendOptions`, `RuntimePortInfo`

**Constants:**
- UPPER_SNAKE_CASE for compile-time constants: `DEFAULT_TAURI_API_PORT`, `SCRAPER_LOG_LIMIT`
- Regular camelCase for runtime constants: `tauriCachedBaseUrl`

## Code Style

**Formatting:**
- Tool: Uses ESLint with TypeScript ESLint and React plugins
- No Prettier config found - relies on ESLint for formatting
- 4-space indentation (TypeScript default)
- Semicolons required

**Linting:**
- Tool: ESLint flat config (`eslint.config.js`)
- Extends: `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs.flat.recommended`, `reactRefresh.configs.vite`
- Globals: `globals.browser`
- ECMAScript 2020
- Ignores: `dist` directory

**TypeScript:**
- Strict mode enabled: `"strict": true` in `tsconfig.json`
- `noUnusedLocals: true` and `noUnusedParameters: true`
- `isolatedModules: true`
- Module resolution: `bundler`
- JSX: `react-jsx`

## Import Organization

**Order:**
1. External React/framework imports: `import { useEffect, useRef } from "react"`
2. External library imports: `import { invoke } from "@tauri-apps/api/core"`
3. Internal relative imports (paths start with `.` or `..`): `import { useStore } from "../store"`
4. Path alias imports (uses `@/`): Not currently used in source files

**Path Aliases:**
- Configured in `vitest.config.ts`: `@/` maps to `./src`
- Not configured in TypeScript (using relative imports)

## Error Handling

**Patterns:**
- Try-catch blocks for async operations with specific error messages
- Console error/warn for non-critical failures with descriptive messages in Chinese (e.g., `"加载数据失败:"`)
- Throws descriptive Error objects: `throw new Error("Failed to fetch sources")`
- Error parsing from HTTP responses: checks for `detail` and `message` fields in JSON payloads

**Examples from `src/api/client.ts`:**
```typescript
try {
    const payload = await res.json();
    if (payload && typeof payload === "object") {
        const detail = "detail" in payload ? payload.detail : null;
        // ...
    }
} catch {
    // ignore non-JSON responses and keep fallback
}
return fallback;
```

## Logging

**Framework:** `console` (browser console)

**Patterns:**
- `console.error` for failures: `console.error("Failed to push scraper task to Tauri:", err)`
- `console.warn` for non-critical issues: `console.warn("Failed to load scraper timeout settings...")`
- `console.log` for debugging/tracing: `console.log("手动将 ${source.name}...")`
- Error messages often in Chinese mixed with English

## Comments

**When to Comment:**
- Complex logic explanations: see `useScraper.ts` for detailed comments on state management
- Non-obvious workarounds: `"// Guard against UI wipeout when navigating back to Dashboard:"`
- TODO-like explanations: `"// Track when scraper was intentionally started by user action"`

**JSDoc/TSDoc:**
- Not extensively used in codebase
- No JSDoc comments observed in source files

## Function Design

**Size:**
- Functions tend to be large in complex hooks (e.g., `useScraper` is 600+ lines)
- Smaller utility functions in `lib/utils.ts`

**Parameters:**
- Typed parameters: `function normalizeScraperTimeoutSeconds(value: number | undefined): number`
- Options objects for flexibility: `handlePushToQueue(source: SourceSummary, options?: { foreground?: boolean })`

**Return Values:**
- Explicit return types on functions
- Async/await for promise-based operations

## Module Design

**Exports:**
- Named exports preferred: `export const useStore = create<AppState>(...)`
- Single export per module for main functionality

**Barrel Files:**
- Not heavily used
- Direct imports from files: `import { useStore } from "../store/index"`

---

*Convention analysis: 2026-03-13*
