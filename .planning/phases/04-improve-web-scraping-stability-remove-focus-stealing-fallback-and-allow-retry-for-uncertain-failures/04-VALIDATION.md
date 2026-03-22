---
phase: 04
slug: improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-20
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + vitest + cargo test |
| **Config file** | `pytest.ini`, `ui-react/vitest.config.ts`, `ui-react/src-tauri/Cargo.toml` |
| **Quick run command** | `python -m pytest tests/core/test_scraper_states.py tests/core/test_refresh_scheduler.py tests/core/test_scraper_internal_api.py -q && npm --prefix ui-react run test -- --run src/hooks/useScraper.test.ts` |
| **Full suite command** | `make test-impacted` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/core/test_scraper_states.py tests/core/test_refresh_scheduler.py tests/core/test_scraper_internal_api.py -q`
- **After every plan wave:** Run `make test-impacted`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PH4-01 | integration | `python -m pytest tests/core/test_scraper_states.py -q` | ✅ | ⬜ pending |
| 04-01-02 | 01 | 1 | PH4-02 | unit | `python -m pytest tests/core/test_refresh_scheduler.py -q` | ✅ | ⬜ pending |
| 04-02-01 | 02 | 2 | PH4-03 | integration | `python -m pytest tests/core/test_scraper_internal_api.py -q` | ✅ | ⬜ pending |
| 04-02-02 | 02 | 2 | PH4-04 | unit | `npm --prefix ui-react run test -- --run src/hooks/useScraper.test.ts` | ✅ | ⬜ pending |
| 04-03-01 | 03 | 3 | PH4-05 | integration/manual | `cargo test --manifest-path ui-react/src-tauri/Cargo.toml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hidden/auxiliary mode webview scrape no longer steals focus on 403 or timeout | PH4-01, PH4-05 | OS window manager + desktop focus behavior is environment-dependent | Start app in auxiliary/hidden mode, trigger scraper 403/timeout path, verify no auto foreground/focus, then confirm error_code is surfaced. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
