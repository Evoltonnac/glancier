# Milestones

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
