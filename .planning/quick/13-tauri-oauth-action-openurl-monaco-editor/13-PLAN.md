---
title: "Fix external links in Tauri"
---

## Objective
Fix issues where external links (OAuth, Action.OpenUrl, Monaco Editor cmd+click) fail to open the web browser in the Tauri app.

## Must Haves
- `shell:allow-open` capability added to `src-tauri/capabilities/default.json`
- Global click listener in `main.tsx` to catch `<a>` tags with `target="_blank"` or external domains, overriding them to use Tauri's `shell.open`
- `isTauri` function updated in `lib/utils.ts` to check `window.__TAURI__` as well, ensuring v2 compatibility.

## Tasks
1. Update `src-tauri/capabilities/default.json`
   - files: `ui-react/src-tauri/capabilities/default.json`
   - action: Add `"shell:allow-open"` to the `permissions` array.
2. Update `main.tsx` global link override
   - files: `ui-react/src/main.tsx`
   - action: Add a capture-phase global click event listener for `<a>` tags to intercept them and route through `shell.open`. Update `window.open` override `isTauri` check.
3. Update `lib/utils.ts`
   - files: `ui-react/src/lib/utils.ts`
   - action: Update `isTauri` to check `__TAURI__` or `__TAURI_INTERNALS__`.