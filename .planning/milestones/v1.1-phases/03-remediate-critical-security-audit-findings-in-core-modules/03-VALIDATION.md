---
phase: 3
slug: remediate-critical-security-audit-findings-in-core-modules
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution and release gate readiness.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + vitest |
| **Config file** | `pytest.ini`, `ui-react/vite.config.ts` |
| **Quick run command** | `make test-impacted` |
| **Full suite command** | `make test-backend && make test-frontend && make test-typecheck` |
| **Estimated runtime** | ~120-300 seconds (depends on impacted scope) |

---

## Sampling Cadence

- **After frontend/auth callback task commits:** Run `npm --prefix ui-react run test -- OAuthCallback.test.tsx`
- **After backend refresh regression task commits:** Run `pytest tests/api/test_refresh_api.py`
- **After each plan task commit:** Run `make test-impacted`
- **Before release sign-off:** Run `make test-backend`, `make test-frontend`, and `make test-typecheck` when TypeScript-sensitive callback paths changed
- **Max feedback latency:** 300 seconds

---

## Requirement Coverage Matrix

| Requirement | Coverage Type | Automated Checks | Manual Checks |
|-------------|---------------|------------------|---------------|
| SEC-01 | backend + regression | `make test-backend`, `make test-impacted` | Review sanitized runtime/API logs during OAuth and refresh runs |
| SEC-02 | backend + frontend callback | `npm --prefix ui-react run test -- OAuthCallback.test.tsx`, `make test-backend` | Validate callback rejects malformed code-exchange payloads without completing auth |
| SEC-03 | backend policy hardening | `make test-backend`, `make test-impacted` | Confirm no policy bypasses in script/http hardening scenarios from phase docs |
| INT-01 | backend diagnostics integrity | `make test-backend` | Spot-check representative failure responses for non-leaking details |
| INT-02 | compatibility/regression | `npm --prefix ui-react run test -- OAuthCallback.test.tsx`, `pytest tests/api/test_refresh_api.py`, `make test-frontend` | Validate existing OAuth start -> callback -> refresh UX still completes |
| GATE-01 | release regression gate | `pytest tests/api/test_refresh_api.py`, `make test-impacted`, `make test-backend`, `make test-frontend` | Confirm critical auth/fetch/refresh scenarios are explicitly exercised and passing |
| GATE-02 | release decision gate | Evidence from `03-SECURITY-GATE.md` command table | Human reviewer checks pass/fail checklist and release decision section |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 03-01-01 | 01 | 1 | SEC-01, SEC-02 | unit/integration | `make test-backend` | ✅ completed |
| 03-02-01 | 02 | 1 | SEC-03, INT-02 | unit/integration | `make test-backend` | ✅ completed |
| 03-03-01 | 03 | 2 | SEC-01, INT-01 | unit/integration | `make test-backend` | ✅ completed |
| 03-04-01 | 04 | 3 | GATE-01, GATE-02, INT-02 | regression | `npm --prefix ui-react run test -- OAuthCallback.test.tsx` + `pytest tests/api/test_refresh_api.py` + `make test-impacted` + release gate commands | ✅ completed |
| 03-05-01 | 05 | 4 | SEC-03, INT-02 | unit/integration + typecheck | `make test-impacted && make test-backend && make test-frontend && make test-typecheck` | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth callback completion from desktop/webview round-trip with valid state binding | SEC-02, INT-02 | Browser/webview callback behavior is runtime-environment coupled | Execute OAuth start in app, complete provider approval, verify callback success and source binding |
| Security release decision package | GATE-02 | Final go/no-go is a human release action | Review `03-SECURITY-GATE.md`, verify all mandatory commands passed, then set release decision |

---

## Validation Sign-Off

- [x] All phase requirements map to concrete automated/manual checks
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 coverage no longer needed for this phase
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready (all 03-04 gate commands completed and documented in `03-SECURITY-GATE.md`)
