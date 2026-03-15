# WebView Scraper Runtime Constraints and Fallback Strategy

## 1. Tauri vs Web Runtime

WebView Scraper depends on native Tauri windows and IPC:
- Tauri runtime: supports task queue, logs, and timeout control.
- Pure Web runtime: scraping execution is unavailable and must degrade gracefully.

## 2. Runtime Constraints

- In non-Tauri runtime, scraper actions must no-op and must not call Tauri APIs.
- Each scraping task should have a timeout (default from settings).
- Timed-out tasks should be dequeued automatically so the scheduler can continue.
- Scraper logs should be visible in UI for troubleshooting.

## 3. Interaction Fallback

When Flow enters `webview_scrape` in browser runtime:
1. Show a clear message: web runtime cannot execute scraping.
2. Provide a desktop download entry.
3. Hide/replace manual-start actions that cannot work in browser.

## 4. State Observability

Recommended signals:
- current task status (`idle` / `running` / `timeout` / `failed`)
- queue length
- latest error summary

Flow-side failure examples: [../flow/04_step_failure_test_inputs.md](../flow/04_step_failure_test_inputs.md)
