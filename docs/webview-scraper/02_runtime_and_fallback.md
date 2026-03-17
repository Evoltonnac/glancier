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

## 3. Interaction Fallback

When Flow enters `webview_scrape` in browser runtime:
1. Show a clear message: web runtime cannot execute scraping.
2. Provide a desktop download entry.
3. Hide/replace manual-start actions that cannot work in browser.

When scraper is blocked (captcha/login wall) in Tauri runtime:
1. Backend marks task as failed and keeps source in `suspended`.
2. UI presents manual foreground resume action.
3. User can reopen worker window to finish auth/captcha and retry.

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

## 5. State Observability

Recommended signals:
- current task status (`idle` / `running` / `timeout` / `failed`)
- queue length
- latest error summary
- backend task lease/attempt metadata for daemon diagnostics

## 6. Regression Checklist for Refactor Reviews

Before shipping scraper refactors, verify all checks:

1. Queue popup count equals Rust queue snapshot count, not suspended source count.
2. Flow handle manual foreground open does not create backend queue entries.
3. Foreground/manual actions do not set queue-running UI state.
4. Queue task timeout still cancels task and queue continues to next task.
5. Foreground/manual tasks are never auto-cancelled by 10s timeout logic.
6. "Clear queue" removes all pending backend queue tasks and queue UI drops to zero.

Flow-side failure examples: [../flow/04_step_failure_test_inputs.md](../flow/04_step_failure_test_inputs.md)
