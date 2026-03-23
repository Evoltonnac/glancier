# Phase 4: Improve web scraping stability, remove focus-stealing fallback, and allow retry for uncertain failures - Research

**Researched:** 2026-03-20  
**Domain:** Backend/Rust-owned WebView scraping reliability, interaction fallback policy, and retry eligibility policy  
**Confidence:** MEDIUM-HIGH

## User Constraints

- Phase scope: improve hidden/auxiliary-mode scraping stability, remove foreground/focus-stealing fallback on 403/other WebView failures, and allow retry refresh for uncertain failures (timeout/network) instead of skipping all non-success states.
- Must preserve current backend/frontend ownership boundary: backend owns workflow/auth/state, frontend renders and provides user controls.
- No dependency churn is required for this phase; implement on existing stack first.
- No phase-specific `*-CONTEXT.md` exists for Phase 4, so there are no additional locked decisions beyond the objective above.

## Summary

The current implementation still hardcodes manual foreground fallback in multiple layers (`core/executor.py`, `core/api.py`, `ui-react/src/hooks/useScraper.ts`, and `ui-react/src-tauri/src/scraper.rs`). On auth-wall signals (401/403/captcha/login-like text), backend and Rust paths inject `force_foreground: true` and Rust calls `set_focus()` during auth-required handling. This behavior conflicts with the new Phase 4 goal to remove focus-stealing fallback.

Auto-refresh currently skips every non-`active` source in `core/refresh_scheduler.py` (`status != active -> continue`). That is the direct reason uncertain failures are not retried automatically. At the same time, timeout/network failures are already classified (`runtime.network_timeout`) but are treated as hard `error` states with no interaction-based retry envelope.

**Primary recommendation:** introduce a strict failure classification matrix (manual-required vs retryable-uncertain), remove forced focus/foreground defaults from backend+Rust auth-failure paths, and change scheduler retry eligibility from status-only gating to status+error-code policy.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | `>=0.115.0` (repo baseline) | Internal scraper lifecycle APIs (`claim/heartbeat/complete/fail`) | Already owns workflow state transitions and idempotent backend contracts |
| Tauri (Rust + JS API) | Rust crate `2.10.2` in repo; docs.rs latest observed `2.10.3` | Hidden worker + foreground/manual WebView control | Existing desktop runtime and queue daemon are already production paths |
| httpx | `>=0.28.0` (repo baseline) | Timeout/network error classification for retry policy | Existing transport layer and exception taxonomy already wired in executor |
| pytest + vitest | `pytest.ini`, `vitest.config.ts` | Regression gates for backend/frontend behavior | Existing CI/local gates already integrated via `make` scripts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `core/scraper_task_store.py` (internal) | current | Durable queue lifecycle and lease semantics | For all backend-managed scraper tasks and retries |
| `core/refresh_scheduler.py` (internal) | current | Auto-refresh queue and dedupe/inflight protections | Extend for retryable non-success scheduling instead of replacing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend existing `RefreshScheduler` gating | Separate retry daemon/service | Adds duplicate queue ownership and race risk |
| Keep Rust auto-focus fallback | Desktop notification + explicit user action | Better UX control; avoids focus stealing but needs clear UI affordance |
| Message parsing for failure typing | Stable `error_code` policy | String matching is brittle; `error_code` is deterministic and testable |

**Installation:**
```bash
# No new dependencies recommended for Phase 4.
```

**Version verification note:** live `npm view` verification was blocked by sandbox/network policy in this session; use repo-pinned versions above and run registry checks when network escalation is available.

## Architecture Patterns

### Recommended Project Structure
```text
core/
├── executor.py           # failure classification + interaction envelope policy
├── api.py                # scraper fail callback -> source state/interaction contract
├── refresh_scheduler.py  # retry eligibility and queued refresh policy
└── source_state.py       # status/interaction contract

ui-react/src/
├── hooks/useScraper.ts   # observer mode + manual controls, no forced foreground fallback
├── components/auth/FlowHandler.tsx
└── pages/Dashboard.tsx   # retry entry points and status/error affordances

ui-react/src-tauri/src/
└── scraper.rs            # auth-required handling, window show/focus behavior
```

### Pattern 1: Deterministic Failure Classification Matrix
**What:** Convert fallback behavior from heuristic message checks and implicit foreground forcing into explicit classes:
- `manual_required` (captcha/login hard requirement)
- `retryable_uncertain` (network timeout, transient backend callback/lease issues)
- `deterministic_error` (invalid credentials, schema/config failure)

**When to use:** In `Executor._normalize_interaction_error`, scraper internal fail handling, and scheduler retry decision path.

**Example:**
```python
# Source: core/executor.py + core/refresh_scheduler.py (project code)
RETRYABLE_ERROR_CODES = {
    "runtime.network_timeout",
    "runtime.retry_required",
    "runtime.scraper_callback_failed",
}

MANUAL_REQUIRED_CODES = {
    "auth.manual_webview_required",
}

def classify_retry_policy(status: str, error_code: str | None) -> str:
    if error_code in RETRYABLE_ERROR_CODES:
        return "retryable_uncertain"
    if error_code in MANUAL_REQUIRED_CODES:
        return "manual_required"
    return "no_auto_retry"
```

### Pattern 2: No Implicit Focus Stealing
**What:** Remove unconditional `set_focus()`/`force_foreground=true` defaults from automatic failure paths.

**When to use:** `handle_scraper_auth` and backend-generated `webview_scrape` interactions for non-user-initiated paths.

**Example:**
```rust
// Source: ui-react/src-tauri/src/scraper.rs (project code)
// Automatic auth-required path: show non-intrusive indicator only.
// User-triggered explicit action ("open manual window"): allow focus.
```

### Pattern 3: Retry Eligibility Uses Status + Error Code
**What:** Replace `status == active` hard gate with policy:
- keep normal active interval refresh
- allow bounded retry for retryable uncertain error codes
- keep manual-required states excluded from auto retry

**When to use:** `RefreshScheduler._tick_once`.

### Anti-Patterns to Avoid
- **Status-only skip rule:** `status != active` blocks all uncertain-retry improvements.
- **Hardcoded `force_foreground` defaults:** creates focus-stealing behavior and violates phase goal.
- **Message-substring classification only:** unstable across i18n/copy changes; prefer `error_code`.
- **Duplicated queue owner logic in frontend:** conflicts with Phase 1 architecture where Rust/backend own automatic progress.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry queue orchestration | New ad-hoc retry service | Extend `core/refresh_scheduler.py` + existing queue semantics | Reuses dedupe/inflight protections and avoids race conditions |
| Scraper task persistence | New storage format/service | `core/scraper_task_store.py` | Already durable, lease-based, idempotent |
| Failure semantics | Free-form text parsing in UI | Stable backend `error_code` contract | Deterministic logic + i18n-safe rendering |
| Foreground/manual flow | Auto-opening/focusing windows on failure | Explicit user action via existing manual controls | Prevents focus stealing and preserves user intent |

**Key insight:** Phase 4 is a policy refinement phase, not a subsystem rewrite phase.

## Common Pitfalls

### Pitfall 1: Removing focus calls in Rust only
**What goes wrong:** Backend still sets `force_foreground`, frontend still requests foreground path, behavior appears unchanged.  
**Why it happens:** Fallback logic is duplicated across backend, frontend, and Rust.  
**How to avoid:** Change all three layers together (`executor.py`, `api.py`, `useScraper.ts`, `scraper.rs`).  
**Warning signs:** `interaction.data.force_foreground === true` still appears for 403/network failures.

### Pitfall 2: Retrying all non-success states
**What goes wrong:** Invalid credentials and manual-auth-required states loop indefinitely.  
**Why it happens:** Retry policy keyed on status only, not error class.  
**How to avoid:** Gate retry by explicit retryable `error_code` allowlist and attempt/backoff bounds.  
**Warning signs:** Repeated refresh cycles for `auth.invalid_credentials` or `auth.manual_webview_required`.

### Pitfall 3: Breaking Phase 1 ownership guarantees
**What goes wrong:** Frontend regains trigger ownership and hidden/minimized reliability regresses.  
**Why it happens:** Re-introducing automatic `push_scraper_task` from UI observers.  
**How to avoid:** Keep frontend observer/manual-control only for automatic paths.  
**Warning signs:** scraper progress depends on Dashboard route visibility again.

## Code Examples

Verified patterns from project code:

### Existing Status Skip That Must Be Refined
```python
# Source: core/refresh_scheduler.py
status = str(record.get("status") or "").strip().lower()
if status != SourceStatus.ACTIVE.value:
    continue
```

### Existing Forced Foreground Flags (to remove for auto paths)
```python
# Source: core/executor.py / core/api.py
data={"force_foreground": True, "manual_only": True}
```

### Existing Focus-Stealing Call Sites (to gate behind explicit user action)
```rust
// Source: ui-react/src-tauri/src/scraper.rs
let _ = window.set_focus();
let _ = win.set_focus();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Frontend-triggered scraper progression | Backend/Rust-owned durable queue + daemon callbacks | 2026-03-15 (Phase 1) | Improved hidden/minimized/occluded reliability |
| Webscraper auth-wall fallback always foreground/manual | Still present in several paths (`force_foreground` + Rust `set_focus`) | Introduced during Phase 12/Phase 1 era | Causes focus-stealing side effects in auxiliary/hidden usage |
| Auto-refresh for active only | `RefreshScheduler` skips all non-success statuses | Current | Prevents uncertain failures from auto-retry recovery |

**Deprecated/outdated for this phase:**
- Treating all 401/403/login-like failures as forced foreground/manual.
- Treating all non-success statuses as permanently non-retryable.

## Open Questions

1. **Should 403 always be manual-required?**
   - What we know: current code maps webview+403 to `auth.manual_webview_required`.
   - What's unclear: some 403s are transient anti-bot/network-edge responses.
   - Recommendation: split by signal quality (captcha/login explicit -> manual; generic 403 + no auth challenge -> uncertain-retry with cap).

2. **What is the retry budget for uncertain failures?**
   - What we know: scheduler currently has no retry-budget model for non-active errors.
   - What's unclear: acceptable max attempts/backoff before surfacing manual action.
   - Recommendation: start with small bounded retries (for example 2-3 attempts, exponential backoff) and emit deterministic terminal code on exhaustion.

3. **Do we need a new error code for scraper internal callback/lease failures?**
   - What we know: network timeout has `runtime.network_timeout`; scraper callback failures are not clearly normalized for retry classing.
   - What's unclear: whether existing `runtime.retry_required` is sufficient.
   - Recommendation: add one stable scraper-runtime transient code if needed, rather than parsing fail-message strings.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest` (backend), `vitest` (frontend), `cargo test` (Tauri Rust) |
| Config file | `pytest.ini`, `ui-react/vitest.config.ts`, `ui-react/src-tauri/Cargo.toml` |
| Quick run command | `python -m pytest tests/core/test_scraper_states.py tests/core/test_refresh_scheduler.py tests/core/test_scraper_internal_api.py -q && npm --prefix ui-react run test -- --run src/hooks/useScraper.test.ts` |
| Full suite command | `make test-impacted` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH4-01 | No forced foreground/focus on automatic webview failures | unit/integration | `python -m pytest tests/core/test_scraper_states.py -q` | ✅ |
| PH4-02 | Uncertain failures are retry-eligible, deterministic failures are not | unit | `python -m pytest tests/core/test_refresh_scheduler.py -q` | ✅ |
| PH4-03 | Internal scraper fail path preserves non-focus fallback contract | integration | `python -m pytest tests/core/test_scraper_internal_api.py -q` | ✅ |
| PH4-04 | Frontend observer/manual controls do not force foreground by default | unit | `npm --prefix ui-react run test -- --run src/hooks/useScraper.test.ts` | ✅ |
| PH4-05 | Rust auth-required path avoids implicit focus steal unless user requested | manual + Rust test | `cargo test --manifest-path ui-react/src-tauri/Cargo.toml` | ⚠️ partial |

### Sampling Rate
- **Per task commit:** targeted backend/frontend tests for touched files.
- **Per wave merge:** `make test-impacted`
- **Phase gate:** `make test-backend && make test-frontend && make test-typecheck` and targeted manual UAT for hidden/auxiliary/focus behavior.

### Wave 0 Gaps
- [ ] Add explicit tests for `force_foreground` removal on 403/captcha classifications where policy says uncertain-retry.
- [ ] Add scheduler tests for status+error-code retry allowlist and retry budget exhaustion.
- [ ] Add frontend tests for revised interaction payload semantics (no default foreground forcing).
- [ ] Add Rust-focused regression (or robust manual checklist) validating no automatic `set_focus()` on auth-required auto path.

## Sources

### Primary (HIGH confidence)
- Project code and docs:
  - `core/executor.py`
  - `core/api.py`
  - `core/refresh_scheduler.py`
  - `core/steps/browser_step.py`
  - `core/scraper_task_store.py`
  - `ui-react/src/hooks/useScraper.ts`
  - `ui-react/src/components/auth/FlowHandler.tsx`
  - `ui-react/src/pages/Dashboard.tsx`
  - `ui-react/src-tauri/src/scraper.rs`
  - `ui-react/src-tauri/src/lib.rs`
  - `docs/webview-scraper/01_architecture_and_dataflow.md`
  - `docs/webview-scraper/02_runtime_and_fallback.md`
  - `tests/core/test_scraper_states.py`
  - `tests/core/test_refresh_scheduler.py`
  - `tests/core/test_scraper_internal_api.py`
  - `tests/core/test_scraper_task_store.py`

### Secondary (MEDIUM confidence)
- Tauri RuntimeHandle docs (activation policy APIs):  
  https://docs.rs/tauri-runtime/latest/x86_64-apple-darwin/tauri_runtime/trait.RuntimeHandle.html
- Tauri v2.8.0 release notes (`set_focusable` API introduction):  
  https://v2.tauri.app/release/tauri/v2.8.0/
- HTTPX advanced timeout behavior:  
  https://www.python-httpx.org/advanced/timeouts/
- Google Cloud retry strategy guidance (transient errors):  
  https://cloud.google.com/storage/docs/retry-strategy
- AWS exponential backoff and jitter guidance:  
  https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Apple App Nap / process activity guidance:  
  https://developer.apple.com/documentation/foundation/processinfo/activityoptions

### Tertiary (LOW confidence)
- Live npm registry version/publish-date checks were not completed in this session due blocked network escalation; version currency should be re-verified when approval/network is available.

## Metadata

**Confidence breakdown:**
- Standard stack: **MEDIUM** - repo versions are clear, but live registry publish-date verification is incomplete in this session.
- Architecture: **HIGH** - recommendations map directly to current code paths and previously verified Phase 1/12 architecture.
- Pitfalls: **MEDIUM-HIGH** - grounded in existing regressions and duplicate fallback logic; exact 403 split policy still needs product decision.

**Research date:** 2026-03-20  
**Valid until:** 2026-04-03 (14 days; runtime/tooling behavior is moderately fast-moving)
