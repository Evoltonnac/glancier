# WebView Scraper Runtime Constraints and Fallback Strategy

## 1. Tauri vs Web Runtime

WebView Scraper depends on native Tauri windows and IPC:
- Tauri runtime: supports task queue, logs, and timeout control.
- Pure Web runtime: scraping execution is unavailable and must degrade gracefully.

## 2. Runtime Constraints

- In non-Tauri runtime, scraper actions must no-op and must not call Tauri APIs.
- Tauri runtime daemon must keep claiming tasks even when Dashboard route is inactive.
- Each claimed task must keep lease heartbeat updates to avoid stale ownership.
- Completion/failure callbacks must go directly to backend internal APIs.
- Scraper logs should still be visible in UI for troubleshooting.
- macOS fullscreen/Space compatibility:
  - Background scraper windows should stay visible across all workspaces to avoid being pushed into a non-active Space where WebKit JS execution can be aggressively throttled.
  - Keep this enabled only for background/manual scraper worker windows; it does not change foreground/manual interaction ownership.
- Enhanced scraping compatibility switch:
  - A global settings switch (`enhanced_scraping`) controls optional JS environment compatibility hooks for WebView scraping.
  - Default is off. When enabled, scraper initialization injects visibility and scheduling patches (`document.visibilityState`, `document.hidden`, `IntersectionObserver`, `requestAnimationFrame`) before user scripts.
  - This switch is intended for JS-heavy websites that stall only under fullscreen/background constraints; keep it disabled for normal sites to minimize side effects.

## 3. Interaction Fallback

When Flow enters `webview_scrape` in browser runtime:
1. Show a clear message: web runtime cannot execute scraping.
2. Provide a desktop download entry.
3. Hide/replace manual-start actions that cannot work in browser.

When scraper is blocked (captcha/login wall) in Tauri runtime:
1. Backend marks task as failed and keeps source in `suspended`.
2. Backend emits a deterministic manual-required payload with `manual_only=true`.
3. Automatic fallback does not auto-show or auto-focus scraper windows.
4. UI presents manual foreground resume action.
5. User can explicitly open the foreground window to finish auth/captcha and retry.

Manual-required payload contract:
- Keep `manual_only=true` for auth-required/manual interactions.
- Do not set `force_foreground=true` by default in automatic fallback payloads.
- Foreground/focus behavior is only enabled by explicit user action.

## 4. Timeout and Queue Progress Rules

1. The default per-task timeout is `10s` for backend-managed queue tasks.
   - Frontend timeout tracking starts from backend lifecycle claim stage (`task_claimed`).
   - Timeout cancellation is applied to the active backend-managed task only.
2. Manual foreground tasks have no timeout.
   - Foreground actions from Flow handle or queue popup are user-driven and unlimited in time.
   - Foreground/manual task lifecycle must not auto-cancel on the 10s timeout path.
3. Promotion to foreground must unblock queue progress.
   - If a backend-managed task is moved to foreground/manual mode, it is removed from queue execution.
   - Queue daemon should continue to next pending task without waiting for the manual task to finish.
4. Queue clear action is global queue cleanup, not active-only cancel.
   - "Clear queue" must remove all active queue tasks in backend storage (optionally per source).
   - Clearing should not leave the next queued task continuing silently.

## 5. Retry Policy for Uncertain Failures

1. WebView uncertain failures may be classified as retryable runtime failures by backend policy.
2. Retry scheduling is owned by backend `RefreshScheduler`, not by WebView runtime/frontend logic.
3. Manual-required auth failures (`auth.manual_webview_required`) stay excluded from automatic retry.
4. Detailed retry signatures, metadata, backoff windows, and reset rules are defined in:
   [../flow/05_refresh_scheduler_and_retry.md](../flow/05_refresh_scheduler_and_retry.md)

## 6. State Observability

Recommended signals:
- current task status (`idle` / `running` / `timeout` / `failed`)
- queue length
- latest error summary
- backend task lease/attempt metadata for daemon diagnostics

## 7. Regression Checklist for Refactor Reviews

Before shipping scraper refactors, verify all checks:

1. Queue popup count equals Rust queue snapshot count, not suspended source count.
2. Flow handle manual foreground open does not create backend queue entries.
3. Foreground/manual actions do not set queue-running UI state.
4. Queue task timeout still cancels task and queue continues to next task.
5. Foreground/manual tasks are never auto-cancelled by 10s timeout logic.
6. "Clear queue" removes all pending backend queue tasks and queue UI drops to zero.
7. Auth-required fallback emits manual-only signals without auto show/focus behavior.

Flow-side failure examples: [../flow/04_step_failure_test_inputs.md](../flow/04_step_failure_test_inputs.md)
