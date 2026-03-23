# WebView Scraper Architecture and Data Flow

## 1. Why WebView Scraper Exists

For platforms with heavy CSR, complex cookie/session behavior, or no public API,
pure HTTP is often insufficient. Glanceus reuses Tauri WebView capabilities on desktop
to run low-overhead background capture.

## 2. End-to-End Data Flow (Python -> FastAPI Internal API -> Rust -> JS)

1. Python reaches a `webview` step, detects missing capture data, and persists a durable scraper task.
2. Source state enters `suspended` with `interaction.type=webview_scrape` for observability/manual fallback.
3. Tauri runtime daemon continuously polls backend internal `claim/heartbeat` endpoints.
4. When a task is claimed, Rust creates hidden `scraper_worker` and injects interception logic.
5. When `intercept_api` is hit, JS sends captured response data back to Rust.
6. Rust reports `complete` or `fail` directly to backend internal APIs.
7. Backend writes secret payload and resumes `fetch_source` without requiring Dashboard polling/listeners.
8. React observes lifecycle logs/status changes and keeps manual foreground actions available when needed.

## 3. Key Implementation Points

- Single worker instance: only one `scraper_worker` at a time to avoid state contamination.
- Resource interception: keep API payload interception (`fetch`/XHR) without suppressing page images/fonts so manual auth pages render correctly.
- Popup fallback bridging: map `window.open`, `_blank` links, and `_blank` forms to same-window navigation in scraper WebView for third-party login compatibility.
- Event bridging: frontend is observer/manual fallback, not automatic trigger owner.

## 4. Interaction Contract (Do Not Regress)

These rules are mandatory and must stay true after refactors:

1. Queue UI source of truth is Rust queue snapshot only.
   - Frontend queue length/items must come from `get_scraper_queue_snapshot`.
   - Frontend must not infer queue from `sources[].status === "suspended"` or similar heuristics.
2. Flow handle "open in foreground" is manual mode, not queue mode.
   - Manual foreground open must not enqueue a backend scraper task.
   - Manual foreground open must not trigger backend refresh APIs that create queue tasks.
3. Promoting an active queue task to foreground detaches it from queue execution.
   - The current backend-managed task must be removed from queue path (fail/clear from queue storage).
   - Queue daemon should be able to continue with next pending task immediately.
4. Manual foreground scraper must not drive queue-state UI.
   - Foreground/manual run is intentionally not reflected as queue-running status.
   - Queue popup should only represent backend-managed queue tasks.

## 5. Interface Boundary with Flow

- Flow owns step input/output, durable task creation, and resume semantics.
- Rust scraper runtime owns task claiming, browser-state execution, and completion callbacks.
- Flow step definitions: [../flow/02_step_reference.md](../flow/02_step_reference.md)
