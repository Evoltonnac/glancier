---
phase: 3
slug: remediate-critical-security-audit-findings-in-core-modules
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + vitest |
| **Config file** | `pytest.ini`, `ui-react/vite.config.ts` |
| **Quick run command** | `make test-impacted` |
| **Full suite command** | `make test-backend && make test-frontend` |
| **Estimated runtime** | ~120-300 seconds (depends on impacted scope) |

---

## Sampling Rate

- **After every task commit:** Run `make test-impacted`
- **After every plan wave:** Run `make test-backend && make test-frontend`
- **Before `$gsd-verify-work`:** Run `make test-backend && make test-frontend && make test-typecheck`
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SEC-01, SEC-02 | unit/integration | `make test-backend` | ✅ | ⬜ pending |
| 03-02-01 | 02 | 1 | SEC-03, INT-02 | unit/integration | `make test-backend` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | SEC-01, INT-01 | unit/integration | `make test-backend` | ✅ | ⬜ pending |
| 03-04-01 | 04 | 2 | GATE-01, GATE-02, INT-02 | regression | `make test-impacted && make test-backend && make test-frontend` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth callback completion from desktop/webview round-trip with valid state binding | SEC-02, INT-02 | Auth browser callback behavior is environment-coupled | Execute auth flow with a test integration and confirm callback success + no secret leakage in logs |

---

## Validation Sign-Off

- [ ] All tasks have automated verify commands or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
