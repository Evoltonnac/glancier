# Roadmap: Glanceus

## Overview
This roadmap manages milestone delivery for Glanceus. Completed milestones are archived for historical reference, and active milestone phases are tracked in this file.

## Milestones

- [x] **v0.1: MVP Foundation & UI Refactoring** — [[Archived Roadmap](.planning/milestones/v0.1-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v0.1-REQUIREMENTS.md)]
- [x] **v1.0: Stable Release + Follow-up Hardening** — [[Archived Roadmap](.planning/milestones/v1.0-ROADMAP.md)] [[Archived Requirements](.planning/milestones/v1.0-REQUIREMENTS.md)] [[Audit](.planning/milestones/v1.0-MILESTONE-AUDIT.md)]
- [ ] **v1.1: Security Audit Remediation (Active)**

## Active Milestone: v1.1 Security Audit Remediation

**Goal:** Remediate critical security audit findings in core modules while preserving config-first integration usability and release stability.

**Coverage:** 1 phase | 7/7 requirements mapped | All covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 3 | Remediate critical security audit findings in core modules | Close critical/high findings without flow regressions | SEC-01, SEC-02, SEC-03, INT-01, INT-02, GATE-01, GATE-02 | 4 |

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
