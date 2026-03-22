# Roadmap: Glanceus

## Overview
This roadmap manages milestone delivery for Glanceus. Completed milestones are archived for historical reference, and active milestone phases are tracked in this file.

## Milestones

- [x] **v0.1: MVP Foundation & UI Refactoring** — [[Archived Roadmap](.planning/milestones/v0.1-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v0.1-REQUIREMENTS.md)]
- [x] **v1.0: Stable Release + Follow-up Hardening** — [[Archived Roadmap](.planning/milestones/v1.0-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v1.0-REQUIREMENTS.md)] [[Audit](.planning/milestones/v1.0-MILESTONE-AUDIT.md)]
- [ ] **v1.1: Security Audit Remediation (Active)**

## Active Milestone: v1.1 Security Audit Remediation

**Goal:** Remediate critical security audit findings in core modules while preserving config-first integration usability and release stability.

**Coverage:** 2 phases | 12/12 requirements mapped | All covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 3 | Remediate critical security audit findings in core modules | Close critical/high findings without flow regressions | SEC-01, SEC-02, SEC-03, INT-01, INT-02, GATE-01, GATE-02 | 4 |
| 4 | Improve web scraping stability, remove focus-stealing fallback, and allow retry for uncertain failures | Harden WebView fallback/retry behavior without regressing backend-owned scraping reliability | PH4-01, PH4-02, PH4-03, PH4-04, PH4-05 | 4 |

### Phase 3: Remediate critical security audit findings in core modules

**Goal:** Eliminate critical audit risks in secret handling, validation boundaries, and runtime safety while keeping existing auth/fetch/refresh behavior stable.
**Requirements**: SEC-01, SEC-02, SEC-03, INT-01, INT-02, GATE-01, GATE-02
**Depends on:** v1.0 archived baseline
**Plans:** 5 planned (5 completed)

Success criteria:
1. Security-sensitive data is no longer exposed in runtime logs, API responses, or persisted snapshots.
2. Security-critical API and flow inputs are validated with deterministic rejection behavior for malformed/unsafe payloads.
3. Existing key integration flows (auth, fetch, refresh) pass regression verification after hardening.
4. A release gate documents and verifies security remediation completion with repeatable pass/fail checks.

Plans:
- [x] 03-01-PLAN.md — OAuth state binding hardening and interact source isolation ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-01-SUMMARY.md)])
- [x] 03-02-PLAN.md — HTTP/script/parser boundary hardening for SSRF/RCE risk reduction ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-02-SUMMARY.md)])
- [x] 03-03-PLAN.md — Central redaction plus internal scraper/file API confidentiality hardening ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-03-SUMMARY.md)])
- [x] 03-04-PLAN.md — Regression and security release gate finalization ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-04-SUMMARY.md)])
- [x] 03-05-PLAN.md — Optional lightweight Script sandbox (Advanced Beta) and default script-timeout guard ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-05-SUMMARY.md)])

### Phase 4: Improve web scraping stability, remove focus-stealing fallback, and allow retry for uncertain failures

**Goal:** Remove automatic focus-stealing fallback in WebView scraper recovery and add bounded retries for uncertain failures while preserving backend-owned workflow state.
**Requirements**: PH4-01, PH4-02, PH4-03, PH4-04, PH4-05
**Depends on:** Phase 3
**Plans:** 3 plans (2 completed)

Success criteria:
1. Automatic WebView fallback paths no longer force foreground/focus behavior across backend, frontend, and Rust runtime paths.
2. Uncertain runtime failures (`runtime.network_timeout` / `runtime.retry_required`) are retried automatically with bounded policy, while deterministic manual/auth failures are excluded.
3. Internal scraper fail callbacks and frontend observer controls preserve deterministic `error_code`/status contracts without implicit foreground forcing.
4. Rust fallback behavior and docs are synchronized, and manual verification confirms no focus stealing in minimized/hidden/occluded usage.

Plans:
- [x] 04-01-PLAN.md — Backend failure classification matrix and bounded uncertain-failure retry policy. ([[Summary](.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-01-SUMMARY.md)])
- [x] 04-02-PLAN.md — Internal scraper fail contract + frontend observer/manual control foreground-intent cleanup. ([[Summary](.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-02-SUMMARY.md)])
- [ ] 04-03-PLAN.md — Rust no-auto-focus auth fallback, docs contract sync, and manual focus-behavior checkpoint.
