# Codebase Concerns

**Analysis Date:** 2026-02-28

## Tech Debt

**Backend Source Resolution Duplication:**
- Issue: Source resolution logic is duplicated in `main.py` (`resolve_stored_source`) and `core/api.py` (`_resolve_stored_source`)
- Files: `main.py`, `core/api.py`
- Impact: Behavior drift risk when one resolver changes without the other
- Fix approach: Extract a shared resolver utility (for example `core/source_resolver.py`) and reuse in both call paths

**Oversized Frontend Orchestrator Component:**
- Issue: Dashboard orchestration, polling, GridStack sync, scraper queue, and dialogs are all in one component
- Files: `ui-react/src/App.tsx`
- Impact: High change risk, difficult testing, stale closure bugs
- Fix approach: Split into hooks/modules (`useDashboardData`, `useScraperQueue`, `DashboardLayout`) and componentize subdomains

**Global Mutable Dependency Container in API Module:**
- Issue: Router module stores global injected service singletons (`_executor`, `_data_controller`, etc.)
- Files: `core/api.py`
- Impact: Harder isolation/unit testing; accidental cross-request coupling
- Fix approach: Move to FastAPI dependency injection per-request or structured app state access wrappers

## Known Bugs

**Undefined Variable in Auth Status Route:**
- Symptoms: Runtime `NameError` potential when `/api/sources/{source_id}/auth-status` evaluates OAuth branch
- Files: `core/api.py` (uses `source.auth` without local `source` definition)
- Trigger: Calling auth-status endpoint for sources where code reaches OAuth check block
- Workaround: None in route; requires code fix to use resolved source object

**Frontend API Methods Without Matching Backend Routes:**
- Symptoms: `listSourceFiles` and `getSourceFile` will always fail if invoked
- Files: `ui-react/src/api/client.ts`, `core/api.py`
- Trigger: Any UI usage of `/api/sources/files` or `/api/sources/files/{filename}`
- Workaround: Avoid calling these methods until backend routes exist or methods are removed

## Security Considerations

**Arbitrary Script Execution from Config Flow:**
- Risk: `script` step executes dynamic Python code with `exec`, enabling arbitrary code execution if integration YAML is untrusted
- Files: `core/executor.py`, `config/integrations/*.yaml`
- Current mitigation: None beyond local trust assumptions
- Recommendations: Gate script steps behind explicit allowlist/feature flag and sandbox or disable in untrusted environments

**Sensitive Request Data Logged During OAuth Exchange:**
- Risk: Token exchange request payload (including client metadata) is logged
- Files: `core/auth/oauth_auth.py`
- Current mitigation: None detected
- Recommendations: Redact sensitive fields before logging and lower verbosity for auth payloads

**Local Secret Persistence Exposure Risk:**
- Risk: Credentials persist in filesystem JSON and may leak through backups/sync/misconfiguration
- Files: `data/secrets.json`, `core/secrets_controller.py`, `.gitignore`
- Current mitigation: Optional AES-GCM encryption mode via `core/encryption.py`
- Recommendations: Enforce encryption by default and warn on plaintext mode in UI (`ui-react/src/pages/Settings.tsx`)

## Performance Bottlenecks

**Aggressive Polling Loop in Dashboard:**
- Problem: Repeated polling every 2s for refreshing sources can cause redundant API traffic and re-renders
- Files: `ui-react/src/App.tsx`, `ui-react/src/api/client.ts`
- Cause: Interval polling tied to source status array updates
- Improvement path: Use server push/events or centralized polling manager with backoff and diff updates

**GridStack Reinitialization Overhead:**
- Problem: `makeWidget` re-runs across item set during updates
- Files: `ui-react/src/App.tsx`
- Cause: Layout sync strategy inside effect reacts to broad dependencies (`viewConfig.items`, `dataMap`)
- Improvement path: Narrow dependencies and reconcile changed nodes only

**File-Based Config Scans on Reload:**
- Problem: Repeated full YAML directory scans and parsing can grow costly with many files
- Files: `core/config_loader.py`, `core/integration_manager.py`
- Cause: each load reads all YAML files and does full merge
- Improvement path: Cache and incremental reload by file mtime/hash

## Fragile Areas

**Scraper Queue Coordination Across State + Refs + Events:**
- Files: `ui-react/src/App.tsx`, `ui-react/src-tauri/src/scraper.rs`
- Why fragile: correctness depends on timing-sensitive ref/state synchronization and cancellation ordering
- Safe modification: change queue logic behind dedicated hook with deterministic state machine tests
- Test coverage: No automated frontend queue tests detected

**Config Merge and Template Substitution:**
- Files: `core/config_loader.py`
- Why fragile: deep merge + format substitution can silently pass unresolved keys and produce partial configs
- Safe modification: add strict validation mode for required template variables and schema-level checks
- Test coverage: no dedicated config-loader test suite detected

**Monolithic API Route Module:**
- Files: `core/api.py`
- Why fragile: many endpoints and shared globals increase regression surface
- Safe modification: split into routers by domain (`sources`, `views`, `settings`, `integrations`)
- Test coverage: API route behavior is largely untested

## Scaling Limits

**Single-Node Local Storage Architecture:**
- Current capacity: local desktop/single-user usage with JSON/TinyDB files
- Limit: concurrent writers/processes and multi-user access are not safely supported
- Scaling path: migrate to durable DB service and add transaction boundaries

**In-Memory Runtime State Map:**
- Current capacity: one backend process lifetime in `Executor._states`
- Limit: state loss on restart and no horizontal scaling compatibility
- Scaling path: persist state transitions to durable store and reload on boot

**Sequential Startup Refresh:**
- Current capacity: startup refresh loops through sources serially
- Limit: slow startup with many integrations or slow providers
- Scaling path: bounded concurrency with retry/backoff and timeout controls

## Dependencies at Risk

**`browser-cookie3`:**
- Risk: Browser storage format/security policy changes can break cookie extraction
- Impact: browser auth integrations fail
- Migration plan: support manual cookie/session import fallback UI/API

**WebView interception approach in Tauri scraper:**
- Risk: platform-specific behavior (hidden windows, event timing) may change across OS/Tauri updates
- Impact: unstable background scrape flow
- Migration plan: isolate scraper adapter and add explicit health checks and retry orchestration

## Missing Critical Features

**No Service-Level Authentication/Authorization for API:**
- Problem: backend endpoints are callable without authentication in local network context
- Blocks: secure remote or shared-host usage

**No Formal Automated Test Pipeline:**
- Problem: core routes, frontend flows, and config resolution lack enforceable CI tests
- Blocks: safe refactor velocity and regression detection

## Test Coverage Gaps

**Backend API and Config Resolver Coverage:**
- What's not tested: route-level behavior, config resolution edge cases, duplicate resolver consistency
- Files: `core/api.py`, `core/config_loader.py`, `main.py`
- Risk: runtime regressions in auth/status and config handling go unnoticed
- Priority: High

**Frontend Dashboard/Scraper Orchestration:**
- What's not tested: queue semantics, polling transitions, GridStack reconciliation
- Files: `ui-react/src/App.tsx`
- Risk: subtle UI races and stale-state bugs in production
- Priority: High

**Tauri Command Integration:**
- What's not tested: command/event handshake between Rust and React
- Files: `ui-react/src-tauri/src/lib.rs`, `ui-react/src-tauri/src/scraper.rs`, `ui-react/src/App.tsx`
- Risk: desktop-only failures not caught during routine backend/frontend checks
- Priority: Medium

---

*Concerns audit: 2026-02-28*
