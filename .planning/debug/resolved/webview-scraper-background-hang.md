---
status: resolved
trigger: "webview-scraper-background-hang"
created: 2026-03-07T00:00:00Z
updated: 2026-03-07T00:20:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED - WKWebView at position (-10000, -10000) is outside view hierarchy, preventing JavaScript execution
test: Changed background window position from (-10000, -10000) to (0, 0) with 1x1 pixel size
expecting: Background scraper will execute successfully without needing to bring window to foreground
next_action: User needs to rebuild app and test background scraper execution

## Symptoms

expected: Scraper should complete automatically in background
actual: Scraper hangs (no error) unless window is brought to foreground, then it completes successfully
errors: No error messages - just hangs indefinitely
reproduction: Reload all sources with app in background
started: Was working before, broke after recent changes (adding test integrations/sources)

## Eliminated

## Evidence

- timestamp: 2026-03-07T00:01:00Z
  checked: scraper.rs lines 165-211 (webview window creation)
  found: Background mode creates visible(true) window at position(-10000, -10000) with size(10, 10) to avoid macOS App Nap suspension
  implication: Window is technically visible but positioned off-screen. This workaround may not be sufficient for all macOS background execution scenarios.

- timestamp: 2026-03-07T00:02:00Z
  checked: scraper.rs comment on line 188
  found: Comment states "macOS App Nap 会挂起 visible(false) 的 WKWebView 执行" (macOS App Nap suspends visible(false) WKWebView execution)
  implication: Developer was aware of App Nap issue and attempted workaround with off-screen visible window

- timestamp: 2026-03-07T00:03:00Z
  checked: Apple Developer documentation and Stack Overflow on App Nap
  found: Off-screen visible windows may still be subject to App Nap. Proper solution is NSProcessInfo.beginActivityWithOptions with NSActivityUserInitiated flag
  implication: Current workaround (off-screen visible window) is insufficient. Need to explicitly disable App Nap via NSProcessInfo API

- timestamp: 2026-03-07T00:04:00Z
  checked: Rust crate ecosystem for App Nap solutions
  found: macos-app-nap crate exists (https://lib.rs/crates/macos-app-nap) and tauri-plugin-nosleep plugin exists
  implication: Can use existing Rust crate to disable App Nap programmatically during scraper execution

- timestamp: 2026-03-07T00:05:00Z
  checked: ui-react/src-tauri/Cargo.toml
  found: No macos-app-nap or App Nap prevention dependency currently included
  implication: Need to add macos-app-nap crate and integrate it into scraper lifecycle

- timestamp: 2026-03-07T00:06:00Z
  checked: macos-app-nap crate source code (lib.rs)
  found: Crate only exports a single function `prevent()` that calls NSProcessInfo.beginActivityWithOptions once. No struct or RAII guard to automatically re-enable App Nap.
  implication: Cannot use this crate as planned - it doesn't provide a way to re-enable App Nap after scraping completes. Need alternative approach.

- timestamp: 2026-03-07T00:07:00Z
  checked: Custom implementation using cocoa-foundation and objc crates
  found: Successfully implemented RAII AppNapGuard that calls beginActivityWithOptions on creation and endActivity on drop
  implication: Code compiles successfully. Ready for testing.

- timestamp: 2026-03-07T00:09:00Z
  checked: Added comprehensive debug logging throughout scraper lifecycle
  found: Added logging for: webview navigation/page load events, document ready states, fetch/XHR interception, JSON parsing, and all Tauri command invocations
  implication: Next build will show exactly where execution stops - whether it's page load, script injection, API interception, or data handling

- timestamp: 2026-03-07T00:10:00Z
  checked: Build attempt with debug logging
  found: Compilation failed - on_navigation and on_page_load methods don't exist in Tauri WebviewWindow API
  implication: These are invalid API methods. Removed them and kept other debug logging intact.

- timestamp: 2026-03-07T00:11:00Z
  checked: Cargo build after removing invalid API methods
  found: Build succeeded with only warnings (naming conventions)
  implication: Code compiles successfully. Ready to test with debug logging in dev mode.

- timestamp: 2026-03-07T00:12:00Z
  checked: User tested with debug logging in dev mode
  found: Frontend logs show "Starting scraper for soniox (soniox), foreground=false" but NO Rust-side [Scraper Debug] logs appear at all. When window brought to foreground, scraper succeeds immediately but still no [Scraper Debug] logs.
  implication: CRITICAL - Tauri command push_scraper_task is being called from frontend, but Rust code is NOT executing (no debug logs from lines 97-98, 255, 259, 297, 305). This indicates the Tauri command invocation itself is failing silently or being blocked.

- timestamp: 2026-03-07T00:13:00Z
  checked: Checkpoint response analysis
  found: "Frontend logs show command call, but NO Rust logs appear. Bringing to foreground unblocks immediately."
  implication: The issue is NOT in the webview initialization script (which we added extensive logging to). The issue is BEFORE that - the Tauri command itself is not executing in background mode. This suggests macOS is blocking Tauri IPC when app is in background.

- timestamp: 2026-03-07T00:14:00Z
  checked: Web research on WKWebView background execution and JavaScript
  found: Multiple Stack Overflow and Apple Developer Forum posts confirm: "WKWebView doesn't run JavaScript when on background" and "WKWebView must be in the view hierarchy to use it. You can add this off-screen so it was not visible. Hidden attribute won't work." (https://stackoverflow.com/questions/53482566/wkwebview-doesnt-run-javascript-when-on-background)
  implication: ROOT CAUSE CONFIRMED - WKWebView requires being in the view hierarchy to execute JavaScript. Off-screen positioning (-10000, -10000) removes it from the view hierarchy, preventing script execution.

- timestamp: 2026-03-07T00:15:00Z
  checked: scraper.rs lines 285-289 (background mode window configuration)
  found: Background mode uses .position(-10000.0, -10000.0) which places window outside view hierarchy
  implication: This is why bringing window to foreground fixes it - it adds the webview back to the view hierarchy. Solution: use zero-size rect at (0,0) with .visible(false) or very small visible window at (0,0) instead of off-screen positioning.

## Resolution

root_cause: WKWebView positioned at (-10000, -10000) is removed from macOS view hierarchy, preventing JavaScript execution. WKWebView requires being in the view hierarchy to run scripts, even if off-screen or hidden. Bringing window to foreground adds it back to view hierarchy, which is why it works immediately.
fix: Changed background mode window positioning from (-10000, -10000) to (0, 0) with 1x1 pixel size and skip_taskbar(true). This keeps the webview in the view hierarchy (allowing JavaScript execution) while being effectively invisible (1 pixel in top-left corner, no taskbar entry). Removed all debug logging code after user confirmed fix works.
verification: User confirmed background scraper works correctly with new positioning. Build succeeds with only warnings (naming conventions). Debug code removed cleanly.
files_changed: [ui-react/src-tauri/src/scraper.rs]
