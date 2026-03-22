# Roadmap: Glanceus

## Overview
This roadmap tracks milestone delivery for Glanceus. v1.1 is an active re-scope (not a version bump): completed Phase 3/4 security and stability hardening remain the baseline, and Phase 5 is the next planned storage refactor phase.

## Milestones

- [x] **v0.1: MVP Foundation & UI Refactoring** - [[Archived Roadmap](.planning/milestones/v0.1-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v0.1-REQUIREMENTS.md)]
- [x] **v1.0: Stable Release + Follow-up Hardening** - [[Archived Roadmap](.planning/milestones/v1.0-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v1.0-REQUIREMENTS.md)] [[Audit](.planning/milestones/v1.0-MILESTONE-AUDIT.md)]
- [ ] **v1.1: Security and Stability Hardening (Active)**

## Active Milestone: v1.1 Security and Stability Hardening

**Goal:** Deliver a security and stability-focused release by retaining completed Phase 3/4 hardening outcomes and completing storage persistence refactoring without breaking config-first integrations.

**Coverage:** 3 phases | 16/16 requirements mapped | 0 unmapped (all covered)

## Phases

- [x] **Phase 3: Security Audit Remediation Baseline** - Closed critical/high security findings while preserving auth/fetch/refresh behavior.
- [x] **Phase 4: WebView Stability and Deterministic Recovery Baseline** - Removed implicit focus stealing and hardened bounded uncertain-failure retry behavior.
- [ ] **Phase 5: Storage Contract Refactor and Crash-Safe Persistence** - Unify persistence contracts, migration, and deterministic recovery/diagnostics.

## Phase Details

### Phase 3: Security Audit Remediation Baseline
**Goal**: Eliminate critical audit risks in secret handling, validation boundaries, and runtime safety while keeping existing auth/fetch/refresh behavior stable.
**Depends on**: v1.0 archived baseline
**Requirements**: SEC-01, SEC-02, SEC-03, INT-01, INT-02, GATE-01, GATE-02
**Success Criteria** (what must be TRUE):
  1. User can run integrations without sensitive data appearing in logs, API responses, or persisted runtime snapshots.
  2. User can submit security-critical API and flow inputs and receive deterministic rejection for malformed or unsafe payloads.
  3. User can complete key auth/fetch/refresh integration paths after hardening with no functional regression.
  4. User can verify remediation readiness through repeatable security gate checks with clear pass/fail criteria.
**Plans**: 5 plans (5 completed)

Plans:
- [x] 03-01-PLAN.md - OAuth state binding hardening and interact source isolation ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-01-SUMMARY.md)])
- [x] 03-02-PLAN.md - HTTP/script/parser boundary hardening for SSRF/RCE risk reduction ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-02-SUMMARY.md)])
- [x] 03-03-PLAN.md - Central redaction plus internal scraper/file API confidentiality hardening ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-03-SUMMARY.md)])
- [x] 03-04-PLAN.md - Regression and security release gate finalization ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-04-SUMMARY.md)])
- [x] 03-05-PLAN.md - Optional lightweight script sandbox (Advanced Beta) and default script-timeout guard ([[Summary](.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-05-SUMMARY.md)])

### Phase 4: WebView Stability and Deterministic Recovery Baseline
**Goal**: Remove automatic focus-stealing fallback in WebView scraper recovery and add bounded retries for uncertain failures while preserving backend-owned workflow state.
**Depends on**: Phase 3
**Requirements**: PH4-01, PH4-02, PH4-03, PH4-04, PH4-05
**Success Criteria** (what must be TRUE):
  1. User can run automatic WebView fallback paths without forced foreground/focus behavior.
  2. User can rely on bounded automatic retries for uncertain runtime failures, while manual/auth-required failures are excluded.
  3. User can observe deterministic fail-classification contracts (`manual_required` vs `retry_required`) across backend/frontend/runtime paths.
  4. User can trigger manual foreground recovery explicitly and still keep no-focus-steal behavior during background automatic handling.
**Plans**: 6 plans (4 completed, 2 deferred)

Plans:
- [x] 04-01-PLAN.md - Backend failure classification matrix and bounded uncertain-failure retry policy ([[Summary](.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-01-SUMMARY.md)])
- [x] 04-02-PLAN.md - Internal scraper fail contract plus frontend observer/manual control foreground-intent cleanup ([[Summary](.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-02-SUMMARY.md)])
- [x] 04-03-PLAN.md - Rust no-auto-focus auth fallback, docs contract sync, and manual focus-behavior checkpoint ([[Summary](.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-03-SUMMARY.md)])
- [ ] 04-04-PLAN.md - Gap-closure auth-handoff/manual-recovery hardening (deferred at phase close)
- [x] 04-05-PLAN.md - Retry metadata/backoff decoupling and churn-safe bounded retry behavior ([[Summary](.planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-05-SUMMARY.md)])
- [ ] 04-06-PLAN.md - Background no-focus-steal/offscreen strategy follow-up (deferred at phase close)

### Phase 5: Storage Contract Refactor and Crash-Safe Persistence
**Goal**: Deliver a unified, versioned storage architecture for runtime/resources/settings with deterministic crash recovery, migration, and diagnostics.
**Depends on**: Phase 4
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04
**Success Criteria** (what must be TRUE):
  1. User can restart the app and see runtime/resources/settings persisted through one unified storage contract with explicit schema versioning.
  2. User can recover from interrupted writes without corrupted Integration Data and without losing the last known-good state.
  3. User can upgrade and automatically migrate existing `data/*.json` files into the refactored format without manual repair.
  4. User can diagnose storage failures via deterministic `error_code` responses and repeatable verification checks.
**Plans**: 3 plans (planned)

Plans:
- [ ] 05-01-PLAN.md - Unified versioned storage contract foundation (SQLite runtime/resources, JSON settings/secrets boundary).
- [ ] 05-02-PLAN.md - Transaction-only crash-safe write path plus memory-only scraper task queue semantics.
- [ ] 05-03-PLAN.md - Startup chunked/idempotent migration, deterministic storage `error_code` diagnostics, and release gate finalization.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 3. Security Audit Remediation Baseline | 5/5 | Complete | 2026-03-19 |
| 4. WebView Stability and Deterministic Recovery Baseline | 4/6 | Complete | 2026-03-20 |
| 5. Storage Contract Refactor and Crash-Safe Persistence | 0/3 | Not started | - |
