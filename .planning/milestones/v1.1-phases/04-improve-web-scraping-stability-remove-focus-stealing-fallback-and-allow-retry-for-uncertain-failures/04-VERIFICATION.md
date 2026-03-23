---
phase: 04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures
verified: 2026-03-20T05:36:19Z
status: gaps_found
score: 9/9 must-haves verified
gaps:
  - truth: "Phase requirement IDs PH4-01..PH4-05 are defined and traceable in REQUIREMENTS.md"
    status: failed
    reason: "All PH4 requirement IDs are referenced in Phase 4 plans/roadmap but missing from .planning/REQUIREMENTS.md, so coverage cannot be formally validated."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "No PH4-01/02/03/04/05 definitions or Phase 4 traceability rows found."
    missing:
      - "Add PH4-01..PH4-05 requirement definitions to .planning/REQUIREMENTS.md with clear descriptions."
      - "Add Phase 4 traceability mapping rows linking PH4-01..PH4-05 to phase 4."
      - "Align plan frontmatter requirement IDs with REQUIREMENTS.md so each ID is resolvable."
---

# Phase 4: Improve web scraping stability, remove focus-stealing fallback, and allow retry for uncertain failures Verification Report

**Phase Goal:** Remove automatic focus-stealing fallback in WebView scraper recovery and add bounded retries for uncertain failures while preserving backend-owned workflow state.
**Verified:** 2026-03-20T05:36:19Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | WebView blocked/auth-required interactions do not rely on implicit foreground forcing metadata. | ✓ VERIFIED | `core/executor.py` manual-required payload uses `manual_only` without `force_foreground` (`581`, `615`, `997`); regression asserts absence of `force_foreground` (`tests/core/test_scraper_states.py:46`). |
| 2 | Uncertain runtime failures are retry-eligible with bounded automatic retries. | ✓ VERIFIED | Retryable error code contract in executor (`core/executor.py:1101`), scheduler allowlist/backoff/cap (`core/refresh_scheduler.py:12-24`, `163`, `175-178`), and retry-cap tests (`tests/core/test_refresh_scheduler.py:290-327`). |
| 3 | Manual-required auth failures are excluded from automatic retry loops. | ✓ VERIFIED | Retry allowlist excludes `auth.manual_webview_required` (`core/refresh_scheduler.py:12-16`); explicit exclusion tests for `error` and `suspended` states (`tests/core/test_refresh_scheduler.py:258-269`). |
| 4 | Internal scraper fail callbacks classify manual-required auth walls separately from uncertain runtime failures. | ✓ VERIFIED | Classification helper and split state writes (`core/api.py:214-218`, `951-970`); backend tests assert both branches (`tests/core/test_scraper_internal_api.py:153-197`, `200-235`). |
| 5 | Manual-required WebView interactions stay manual-only and do not carry automatic foreground forcing metadata. | ✓ VERIFIED | Internal API interaction payload includes `manual_only` only (`core/api.py:199-210`); tests assert no `force_foreground` (`tests/core/test_scraper_internal_api.py:197`, `ui-react/src/hooks/useScraper.test.ts:214-256`). |
| 6 | Frontend enters foreground mode only when user explicitly requests it. | ✓ VERIFIED | `useScraper` gates foreground by `options.foreground` and defaults to backend `refreshSource` (`ui-react/src/hooks/useScraper.ts:263-331`); legacy `force_foreground` ignored in tests (`ui-react/src/hooks/useScraper.test.ts:139-170`). |
| 7 | Automatic auth-required fallback no longer steals focus from user workspace. | ✓ VERIFIED | Rust `handle_scraper_auth` emits fail callback/event with no `show`/`set_focus` calls (`ui-react/src-tauri/src/scraper.rs:1557-1639`); contract test enforces no auto-focus/show (`ui-react/src-tauri/src/scraper.rs:1923-1944`). |
| 8 | User-triggered manual foreground actions still open/focus scraper window explicitly. | ✓ VERIFIED | Explicit foreground paths keep `show`/`set_focus` (`ui-react/src-tauri/src/scraper.rs:1109-1110`, `1643-1667`); frontend invokes explicit commands (`ui-react/src/hooks/useScraper.ts:300-317`, `345-358`). |
| 9 | Runtime/fallback docs reflect no-auto-focus behavior and retry policy details. | ✓ VERIFIED | Docs include no-auto-focus + manual-only contract + 3-attempt retry backoff (`docs/webview-scraper/02_runtime_and_fallback.md:24-56`, `docs/flow/04_step_failure_test_inputs.md:40-52`). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `core/executor.py` | Failure classification contract for manual-required vs retryable uncertain outcomes | ✓ VERIFIED | Exists, substantive, wired to persisted `error_code` state updates consumed by scheduler (`171-206`, `554-626`, `1083-1121`). |
| `core/refresh_scheduler.py` | Bounded retry policy with status+error_code gating | ✓ VERIFIED | Exists, substantive, wired to executor refresh pipeline (`12-24`, `160-181`, `253-268`). |
| `tests/core/test_refresh_scheduler.py` | Retry allowlist/backoff/cap regression coverage | ✓ VERIFIED | Exists, substantive tests for retry windows/cap and non-retryable exclusions (`193-327`, `241-269`). |
| `core/api.py` | Internal scraper fail classification + deterministic state writes | ✓ VERIFIED | Exists, substantive, wired to executor state update path (`214-218`, `926-974`). |
| `ui-react/src/hooks/useScraper.ts` | Explicit-intent foreground behavior and backend-owned non-foreground retry path | ✓ VERIFIED | Exists, substantive, wired in dashboard usage and API client call (`263-331`, `ui-react/src/pages/Dashboard.tsx:426`). |
| `tests/core/test_scraper_internal_api.py` | Regression coverage for internal fail classification and metadata contract | ✓ VERIFIED | Exists, substantive tests for manual/retry split and idempotency (`153-267`). |
| `ui-react/src-tauri/src/scraper.rs` | No-auto-focus auth fallback with explicit foreground commands preserved | ✓ VERIFIED | Exists, substantive, wired through Tauri command registration and events (`1557-1667`, `ui-react/src-tauri/src/lib.rs:1185-1186`). |
| `docs/webview-scraper/02_runtime_and_fallback.md` | Runtime fallback/no-focus/retry contract documentation | ✓ VERIFIED | Exists, substantive, cross-linked to failure test inputs doc (`24-56`, `84`). |
| `docs/flow/04_step_failure_test_inputs.md` | Failure input contract updates for manual-only and retryable uncertain failures | ✓ VERIFIED | Exists, substantive, references runtime fallback contract (`40-52`, `54`). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `core/executor.py` | `core/refresh_scheduler.py` | Persisted `error_code` consumed by scheduler retry eligibility | ✓ WIRED | Executor persists `error_code` in state store (`core/executor.py:200-206`); scheduler reads `error_code` allowlist (`core/refresh_scheduler.py:160-163`). |
| `core/refresh_scheduler.py` | `core/executor.py` | `_refresh_source` queues bounded auto retries through `executor.fetch_source()` | ✓ WIRED | Retry enqueue path calls `_refresh_source`, then `await self._executor.fetch_source(source)` (`core/refresh_scheduler.py:235`, `268`). |
| `core/api.py` | `core/executor.py` | `_update_state(status, interaction, error_code)` deterministic fail classification | ✓ WIRED | Internal fail route branches call executor `_update_state` with manual/retry codes (`core/api.py:951-970`). |
| `ui-react/src/hooks/useScraper.ts` | `core/api.py /refresh/{source_id}` | Non-foreground retry path calls backend refresh endpoint | ✓ WIRED | Hook calls `api.refreshSource(source.id)` (`ui-react/src/hooks/useScraper.ts:330`); API client posts `/refresh/{id}` (`ui-react/src/api/client.ts:259-263`); backend route exists (`core/api.py` `@router.post("/refresh/{source_id}")`). |
| `ui-react/src-tauri/src/scraper.rs` | `ui-react/src/hooks/useScraper.ts` | `scraper_auth_required` event informs UI; user action drives foreground open | ✓ WIRED | Rust emits `scraper_auth_required` (`ui-react/src-tauri/src/scraper.rs:1619`); hook listens and updates interaction state (`ui-react/src/hooks/useScraper.ts:483-517`). |
| `ui-react/src-tauri/src/scraper.rs` | `ui-react/src-tauri/src/lib.rs` | `show_scraper_window` explicit focus path exposed as main-window command | ✓ WIRED | `show_scraper_window` contains `show` + `set_focus` (`ui-react/src-tauri/src/scraper.rs:1643-1667`) and is registered in invoke handler (`ui-react/src-tauri/src/lib.rs:1185`). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PH4-01 | 04-01-PLAN.md | Not defined in `.planning/REQUIREMENTS.md` | ✗ BLOCKED | `rg "PH4-01" .planning/REQUIREMENTS.md` returned no matches. |
| PH4-02 | 04-01-PLAN.md | Not defined in `.planning/REQUIREMENTS.md` | ✗ BLOCKED | `rg "PH4-02" .planning/REQUIREMENTS.md` returned no matches. |
| PH4-03 | 04-02-PLAN.md | Not defined in `.planning/REQUIREMENTS.md` | ✗ BLOCKED | `rg "PH4-03" .planning/REQUIREMENTS.md` returned no matches. |
| PH4-04 | 04-02-PLAN.md | Not defined in `.planning/REQUIREMENTS.md` | ✗ BLOCKED | `rg "PH4-04" .planning/REQUIREMENTS.md` returned no matches. |
| PH4-05 | 04-03-PLAN.md | Not defined in `.planning/REQUIREMENTS.md` | ✗ BLOCKED | `rg "PH4-05" .planning/REQUIREMENTS.md` returned no matches. |

Orphaned requirements check:
- No Phase 4 requirement mappings were found in `.planning/REQUIREMENTS.md` (`rg "Phase 4|PH4-"` returned no matches).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `ui-react/src/hooks/useScraper.ts` | 484 | `console.log` in auth-required listener | ℹ️ Info | Diagnostic logging only; no placeholder/stub behavior detected. |

### Human Verification Required

### 1. No Focus-Stealing Under Minimized/Occluded Conditions

**Test:** Minimize or occlude main window, trigger auth-required scraper fallback, observe window behavior.
**Expected:** No scraper window auto-show or auto-focus occurs.
**Why human:** Requires OS/window-manager focus behavior validation that static code checks cannot fully prove.

### 2. Explicit Manual Foreground Recovery

**Test:** Use UI "Needs Fix" or manual foreground action after auth-required fallback.
**Expected:** Scraper window opens and receives focus.
**Why human:** End-to-end window behavior across Tauri runtime and host OS cannot be fully guaranteed by grep-level verification.

### 3. Dashboard Diagnostics Continuity

**Test:** After fallback/retry events, inspect dashboard source card status and `error_code` diagnostics.
**Expected:** Deterministic status/`error_code` remains visible (`auth.manual_webview_required` or `runtime.retry_required`).
**Why human:** UI rendering and UX diagnostics clarity require runtime interaction.

### Gaps Summary

Implementation-level Phase 4 goals are met in code: automatic fallback no longer forces foreground behavior, uncertain failures are retryable with bounded scheduler policy, and explicit manual foreground paths remain intact.  
The blocking gap is requirements traceability: plan-declared IDs `PH4-01..PH4-05` are not defined in `.planning/REQUIREMENTS.md`, so formal requirement coverage cannot be completed even though code contracts are present.

---

_Verified: 2026-03-20T05:36:19Z_  
_Verifier: Claude (gsd-verifier)_
