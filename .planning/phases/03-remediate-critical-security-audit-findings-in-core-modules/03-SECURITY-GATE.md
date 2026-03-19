# Phase 3 Security Release Gate

**Phase:** `03-remediate-critical-security-audit-findings-in-core-modules`  
**Plan:** `03-04`  
**Status:** In progress

## Scope

This gate covers release-readiness evidence for the hardening work in Phase 3 with focus on:

- OAuth callback source/state integrity and non-bypass behavior
- Auth/fetch/refresh regression stability after security changes
- Deterministic pass/fail criteria mapped to requirement IDs

## Requirement Coverage

| Requirement | Evidence | Pass Condition | Fail Condition |
|-------------|----------|----------------|----------------|
| GATE-01 | Regression commands and targeted tests | All required regression commands exit 0 and targeted auth/refresh tests pass | Any required command fails or targeted regression test fails |
| GATE-02 | This checklist and release decision section | Requirement coverage, command outputs, and manual checks are all marked PASS before release | Missing evidence, ambiguous outcomes, or unresolved FAIL item |
| INT-02 | OAuth callback + refresh regression tests | Existing OAuth completion and refresh success path remains stable post-hardening | Backward-compatible flow breaks or callback/refresh behaviors regress |
| SEC-02 | Callback validation tests and backend state-binding checks | Invalid callback payloads are rejected deterministically and cannot bypass source binding | Callback accepts malformed payload or can complete with inferred local fallback |

## Commands

Run all commands from repository root unless specified.

| Command | Requirement Links | Status | Latest Result |
|---------|-------------------|--------|---------------|
| `npm --prefix ui-react run test -- OAuthCallback.test.tsx` | SEC-02, INT-02, GATE-01 | ✅ PASS | Completed during Task 1 |
| `pytest tests/api/test_refresh_api.py` | INT-02, GATE-01 | ⬜ pending | To run in Task 3 |
| `make test-impacted` | GATE-01 | ⬜ pending | To run in Task 3 |
| `make test-backend` | GATE-01, GATE-02 | ⬜ pending | Final verification pending |
| `make test-frontend` | GATE-01, GATE-02 | ⬜ pending | Final verification pending |
| `make test-typecheck` | SEC-02, GATE-01 | ⬜ pending | Required because TS callback path changed in this plan |

## Manual Verifications

| Check | Requirement Links | Status | Evidence |
|-------|-------------------|--------|----------|
| OAuth code flow callback succeeds only when backend state binding resolves a single source | SEC-02, INT-02 | ⬜ pending | Confirm no local/source inference fallback in callback completion |
| Invalid OAuth callback payload (`interaction_type=oauth_code_exchange` without required state/code parameters) shows deterministic error and does not call backend exchange | SEC-02, GATE-01 | ✅ PASS | Covered by `OAuthCallback.test.tsx` |
| Release reviewer confirms all command rows are PASS before sign-off | GATE-02 | ⬜ pending | Release decision checklist |

## Release Decision

Decision rules:

- **PASS** when every command row is `✅ PASS`, manual checks are completed, and no open critical/high security regression remains.
- **FAIL** when any required command/manual check is `❌ FAIL` or unresolved.

Current decision: **PENDING**

Release checklist:

- [ ] `npm --prefix ui-react run test -- OAuthCallback.test.tsx`
- [ ] `pytest tests/api/test_refresh_api.py`
- [ ] `make test-impacted`
- [ ] `make test-backend`
- [ ] `make test-frontend`
- [ ] `make test-typecheck`
- [ ] Manual verification rows completed
- [ ] Final decision updated to PASS/FAIL with timestamp
