# WebView Scraper Architecture and Data Flow

## 1. Why WebView Scraper Exists

For platforms with heavy CSR, complex cookie/session behavior, or no public API,
pure HTTP is often insufficient. Glancier reuses Tauri WebView capabilities on desktop
to run low-overhead background capture.

## 2. End-to-End Data Flow (Python -> React -> Rust -> JS)

1. Python reaches a `webview` step and detects missing capture data.
2. Python sets `NeedsInteraction(type="webview_scrape")` and suspends.
3. React `FlowHandler` takes over and sends Tauri IPC (`push_scraper_task`).
4. Rust creates hidden `scraper_worker` and injects interception logic.
5. When `intercept_api` is hit, JS sends captured response data back to Rust.
6. Rust emits `scraper_result` to React.
7. React submits capture result through backend interaction API.
8. Python resumes Flow; downstream `extract` continues processing.

## 3. Key Implementation Points

- Single worker instance: only one `scraper_worker` at a time to avoid state contamination.
- Resource interception: block non-essential static assets to reduce network/load overhead.
- Event bridging: frontend only relays events; scraping business logic stays out of view components.

## 4. Interface Boundary with Flow

- Flow owns step input/output and resume semantics.
- Scraper owns browser-state execution and network interception.
- Flow step definitions: [../flow/02_step_reference.md](../flow/02_step_reference.md)
