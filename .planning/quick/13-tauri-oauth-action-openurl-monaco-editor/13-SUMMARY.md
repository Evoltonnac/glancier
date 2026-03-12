---
title: "Fix external links in Tauri"
status: "completed"
---

## Summary
Successfully fixed external links not opening in the system browser when running the Tauri app. 
1. Added `"shell:allow-open"` permission to `ui-react/src-tauri/capabilities/default.json`.
2. Intercepted standard `<a>` tags globally in `ui-react/src/main.tsx` to utilize `@tauri-apps/plugin-shell`'s `open()` API.
3. Updated `window.open` override and `isTauri` check in `ui-react/src/lib/utils.ts` to be compatible with Tauri v2 checking `window.__TAURI__`.

This fixes OAuth links, `Action.OpenUrl` items, and Monaco Editor `cmd+click` links which now safely route through the shell plugin and open in the default web browser.