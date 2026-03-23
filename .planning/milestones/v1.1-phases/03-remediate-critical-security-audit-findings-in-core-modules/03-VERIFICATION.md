---
phase: 03-remediate-critical-security-audit-findings-in-core-modules
verified: 2026-03-19T14:26:43Z
status: gaps_found
score: 12/13 must-haves verified
gaps:
  - truth: "Parser and script execution cannot load arbitrary filesystem paths outside approved integration roots."
    status: failed
    reason: "Plan-02 parser hardening artifacts are missing, and deterministic parser/path error contracts are absent."
    artifacts:
      - path: "core/parser.py"
        issue: "Missing file; no parser-side script path allowlist enforcement found."
      - path: "tests/core/test_parser_security.py"
        issue: "Missing regression suite for traversal/outside-root script path blocking."
      - path: "core/steps/script_step.py"
        issue: "Does not implement the planned script_path_not_allowed/script_path_missing path-allowlist contract."
    missing:
      - "Implement parser/script path allowlist checks constrained to approved integration roots."
      - "Emit deterministic script_path_not_allowed/script_path_missing errors for unsafe/missing script paths."
      - "Add parser security tests for traversal, outside-root absolute paths, and in-root allowed scripts."
---

# Phase 3: Remediate critical security audit findings in core modules Verification Report

**Phase Goal:** Eliminate critical audit risks in secret handling, validation boundaries, and runtime safety while keeping existing auth/fetch/refresh behavior stable.
**Verified:** 2026-03-19T14:26:43Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | OAuth code exchange succeeds only when server-bound state matches source_id, redirect_uri, and verifier. | ✓ VERIFIED | `core/auth/oauth_auth.py` validates state/source/redirect + single-use (`used_at`) and binds verifier (`_validate_code_exchange_state`, `get_authorize_url`). |
| 2 | Cross-source interaction payloads cannot redirect secret writes away from the route source_id. | ✓ VERIFIED | `core/api.py` rejects route/body source mismatch via `_validate_interaction_source_binding` and writes secrets using route `source_id` only in `interact_source`. |
| 3 | HTTP requests reject unsafe local/private/unsupported targets before network execution. | ✓ VERIFIED | `core/steps/http_step.py` preflights with `_validate_http_target_url` before `httpx.AsyncClient`, blocking private hosts and unsupported schemes. |
| 4 | Parser and script execution cannot load arbitrary filesystem paths outside approved integration roots. | ✗ FAILED | `core/parser.py` and `tests/core/test_parser_security.py` are missing; no `script_path_not_allowed` / `script_path_missing` contract found in `core/` and `tests/`. |
| 5 | Sensitive token/secret fields are redacted consistently in API/auth/script logs. | ✓ VERIFIED | `core/log_redaction.py` provides `[REDACTED]`; `core/api.py` uses `_redact_log_payload`; `core/auth/oauth_auth.py` and `core/steps/script_step.py` use redaction/sanitized reasons. |
| 6 | Internal scraper endpoints require service authentication, not localhost-only trust. | ✓ VERIFIED | `core/api.py::_verify_internal_request` requires `X-Glanceus-Internal-Token` + constant-time comparison + localhost gate; internal scraper routes call it. |
| 7 | Integration file APIs never expose absolute filesystem paths. | ✓ VERIFIED | `core/api.py::_to_logical_integration_file` returns logical `filename`/`integration_id`; file endpoints use logical serializer; tests assert no absolute path leakage. |
| 8 | Critical auth/fetch/refresh flows have a documented and repeatable regression gate. | ✓ VERIFIED | `03-SECURITY-GATE.md` includes required command matrix and latest pass evidence. |
| 9 | Frontend OAuth callback behavior aligns with backend state-validation contract and does not bypass source binding. | ✓ VERIFIED | `OAuthCallback.tsx` requires callback params for code exchange and no local `source_id` fallback; `OAuthCallback.test.tsx` covers missing state and no localStorage inference. |
| 10 | Phase security readiness is decided by explicit pass/fail checks, not ad-hoc judgment. | ✓ VERIFIED | `03-SECURITY-GATE.md` defines PASS/FAIL rules and explicit release decision criteria. |
| 11 | Script sandbox remains opt-in and off by default to preserve compatibility with existing integrations. | ✓ VERIFIED | `core/settings_manager.py` defaults `script_sandbox_enabled=False`; tests cover default and sandbox-off compatibility behavior. |
| 12 | Advanced Settings exposes sandbox toggle with explicit Beta labeling and persisted backend ownership. | ✓ VERIFIED | `Settings.tsx` renders Beta-labeled sandbox controls; `/api/settings` contract includes persisted `script_sandbox_enabled` and `script_timeout_seconds`. |
| 13 | Script step enforces a default timeout even when sandbox is disabled. | ✓ VERIFIED | `core/steps/script_step.py` always wraps execution in `_ScriptTimeoutGuard`; tests validate deterministic `script_timeout_exceeded` behavior. |

**Score:** 12/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `core/auth/oauth_auth.py` | Single-use OAuth state binding with deterministic mismatch rejection | ✓ VERIFIED | Exists, substantive state checks implemented, used by API OAuth exchange path. |
| `core/api.py` (Plan 01) | Route-bound interaction validation blocking body source_id override | ✓ VERIFIED | `_validate_interaction_source_binding` + payload-key allowlist in `interact_source`. |
| `core/steps/http_step.py` | Outbound URL safety guard and deterministic rejection codes | ✓ VERIFIED | `_validate_http_target_url` blocks private/scheme targets pre-network. |
| `core/parser.py` | Script parser path allowlist enforcement | ✗ MISSING | File absent in repository. |
| `core/steps/script_step.py` (Plan 02 expectation) | Guardrails against unsafe local path usage | ✗ STUB | Implements timeout/sandbox, but not planned parser/path allowlist contract (`script_path_not_allowed`/`script_path_missing`). |
| `core/api.py` (Plan 03) | Redaction usage + authenticated internal scraper endpoint guard | ✓ VERIFIED | Redacted logging helpers and internal token checks are in active route paths. |
| `core/auth/oauth_auth.py` (Plan 03) | No raw OAuth payload/token logging | ✓ VERIFIED | Uses redaction/sanitization helpers in OAuth logging paths. |
| `core/steps/script_step.py` (Plan 03) | No raw script source dump in error logs | ✓ VERIFIED | Error log emits source_id/step_id/sanitized reason only. |
| `.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-SECURITY-GATE.md` | Release gate checklist mapped to requirement IDs and commands | ✓ VERIFIED | Exists with scope, requirement coverage, command table, and decision rules. |
| `ui-react/src/components/auth/OAuthCallback.tsx` | Callback handling requiring server-validated completion | ✓ VERIFIED | Uses backend callback-interact response `source_id`; rejects malformed callback payloads client-side. |
| `.planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-VALIDATION.md` | Nyquist-oriented validation map | ✓ VERIFIED | Exists with `nyquist_compliant: true` and requirement coverage matrix. |
| `core/steps/script_step.py` (Plan 05) | Sandbox restrictions + deterministic timeout handling | ✓ VERIFIED | Includes sandbox AST checks and timeout guard with deterministic error codes. |
| `core/settings_manager.py` | Persisted script sandbox/timeout settings defaults | ✓ VERIFIED | Defines and normalizes persisted `script_sandbox_enabled` and `script_timeout_seconds`. |
| `ui-react/src/pages/Settings.tsx` | Advanced UI controls + Beta labeling for script sandbox | ✓ VERIFIED | Renders and updates script controls via backend settings contract and i18n keys. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `core/api.py` | `core/auth/oauth_auth.py` | oauth_code_exchange interaction validation before `exchange_code` execution | WIRED | `interact_source` validates binding/payload then invokes OAuth handler `exchange_code(code, redirect_uri, state)`. |
| `core/steps/http_step.py` | `tests/core/test_http_step.py` | blocked-target regression assertions | WIRED | Tests assert private/scheme rejections and verify no client initialization for blocked targets. |
| `core/api.py` | `tests/core/test_scraper_internal_api.py` | internal endpoint auth token requirement | WIRED | Tests cover missing/invalid token -> `internal_auth_required`. |
| `ui-react/src/components/auth/OAuthCallback.tsx` | `tests/api/test_refresh_api.py` | end-to-end auth completion and refresh stability expectations | WIRED | Indirect contract wiring via `/api/oauth/callback/interact` and `/api/refresh` behaviors verified in backend regression tests. |
| `core/settings_manager.py` | `ui-react/src/pages/Settings.tsx` | `/api/settings` contract for `script_sandbox_enabled` + `script_timeout_seconds` | WIRED | Backend model/API and frontend client/page share persisted fields and update flow. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| SEC-01 | 03-03 | No plaintext secrets in logs/API/state snapshots | ✓ SATISFIED | Redaction utilities and redacted/sanitized auth/api/script logging in active paths; regression tests pass. |
| SEC-02 | 03-01, 03-04 | Deterministic validation for security-sensitive inputs | ✓ SATISFIED | OAuth state binding, source binding checks, callback payload validation and tests (`oauth_state_invalid`, `interaction_source_mismatch`). |
| SEC-03 | 03-02, 03-05 | Block dangerous step input expansion | ✗ BLOCKED | HTTP target blocking is present, but Plan-02 parser/path allowlist artifacts/tests are missing (`core/parser.py`, `tests/core/test_parser_security.py`). |
| INT-01 | 03-03 | Non-leaking but actionable error responses | ✓ SATISFIED | `sanitize_log_reason` integrated in auth/api/script error logs; no raw secret/script dumps in inspected paths. |
| INT-02 | 03-01, 03-02, 03-04, 03-05 | Backward-compatible behavior after security fixes | ✓ SATISFIED | Targeted regression suite run during verification passed (`63 passed` across auth/http/scraper/refresh/settings/script/concurrency tests). |
| GATE-01 | 03-04 | Critical auth/fetch/refresh regression verification | ✓ SATISFIED | Security gate includes regression commands; targeted refresh/callback regressions are present and passing. |
| GATE-02 | 03-04 | Documented release gate with repeatable pass/fail checks | ✓ SATISFIED | `03-SECURITY-GATE.md` provides requirement mapping, command outcomes, and explicit release decision logic. |

Orphaned requirement IDs for Phase 3 in `REQUIREMENTS.md`: **None** (all Phase 3 IDs appear in plan frontmatter).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| N/A | N/A | No blocker TODO/FIXME/placeholder/empty-implementation patterns found in phase-modified files | ℹ️ Info | No additional blocker anti-patterns detected by static scan. |

### Human Verification Required

### 1. OAuth Provider Live Round-Trip

**Test:** Start OAuth from UI, complete provider consent, return to callback page, then trigger refresh for that source.  
**Expected:** Callback succeeds only with valid state binding; refresh succeeds without source mix-up.  
**Why human:** Real browser/provider redirect behavior and window-close UX depend on runtime environment and provider.

### 2. Internal Scraper Daemon Auth Handshake

**Test:** Run internal scraper worker with valid and invalid `X-Glanceus-Internal-Token` against local backend.  
**Expected:** Invalid/missing token gets 403 `internal_auth_required`; valid token path claims/completes tasks normally.  
**Why human:** Cross-process daemon behavior and deployment token wiring are environment-specific.

### Gaps Summary

Phase 3 is mostly implemented and regression tests for critical flows are currently passing, but one must-have remains open from Plan 02: parser/path boundary hardening. The expected parser artifact and regression test module are missing, and the planned deterministic parser/path error contract is absent in code. This leaves SEC-03 not fully closed under the declared must-have contract.

---

_Verified: 2026-03-19T14:26:43Z_  
_Verifier: Claude (gsd-verifier)_
