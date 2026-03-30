# Milestones

## v1.2 SQL Data Access and Visualization Expansion (Shipped: 2026-03-29)

**Phases completed:** 4 phases (07-10), 11 plans, 3 tasks

**Key accomplishments:**
- **SQL Step Implementation**: Added connection patterns for SQL queries, enabling integrations to fetch data from external databases like SQLite and PostgreSQL without backend code changes.
- **Normalized Data Contracts**: Established a unified envelope for SQL responses, including metadata for fields to drive frontend rendering.
- **Bento Chart Widgets**: Shipped a set of chart-oriented Bento widgets (Area, Bar, Line, Pie, Table) that consume normalized SQL data.
- **Risk-Operation Trust Architecture**: Expanded the trust-gating system to protect against high-risk database operations and private network access.
- **Metadata-Driven UI**: Resolved gaps in chart field mapping by ensuring frontend validators consume backend-emitted field metadata (CHART-06, CHART-07).
- **Cross-Phase E2E Stability**: Verified the full data flow from SQL execution to interactive chart rendering with proper loading and error states.

**Known gaps accepted at completion:**
- Phase 11 (Authoring Usability and Diagnostics Hardening) was removed from v1.2 scope and deferred to future work.
- Requirement UX-01 to UX-04 were dropped from this milestone cycle.

---

## v1.1 Security and Stability Hardening (Shipped: 2026-03-23)

**Phases completed:** 4 phases, 16 plans, 6 tasks

**Key accomplishments:**
- Closed critical/high security findings and hardened secret/input/runtime safety boundaries while preserving auth/fetch/refresh behavior.
- Shipped deterministic WebView fallback behavior with no implicit focus stealing and bounded uncertain-failure retry contracts.
- Completed storage contract refactor for unified persistence, startup migration safety, and stable `storage.*` diagnostics.
- Included Phase 6 in v1.1 scope and shipped dashboard management + multi-view tab workflows with state/i18n/doc contract sync.

**Known gaps accepted at completion:**
- v1.1 milestone audit file (`.planning/v1.1-MILESTONE-AUDIT.md`) was not generated before archival; completion proceeded by explicit user request.

---

## v1.0 稳定版发版 (Shipped: 2026-03-13)

**Phases completed:** 9 phases (09-15 + follow-up Phase 1/2 consolidated), 38 plans

**Key accomplishments:**
- Delivered stable v1.0 release with branding/terminology refresh, semantic refactor, and TDD-centered quality baseline.
- Completed OAuth Authlib integration and multi-flow support (authorization code + PKCE, device flow, client credentials).
- Consolidated post-release follow-up hardening into v1.0 context:
  - Phase 1: backend-driven webview scraper reliability for minimized/hidden/occluded states.
  - Phase 2: usability/i18n/default-settings hardening (error formatting, EN/ZH, refresh/encryption defaults).

---
