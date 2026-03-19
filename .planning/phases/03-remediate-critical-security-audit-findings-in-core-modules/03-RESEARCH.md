# Phase 3: Security Audit Remediation Research

**Researched:** 2026-03-19
**Phase:** 3 — Remediate critical security audit findings in core modules
**Requirement IDs:** SEC-01, SEC-02, SEC-03, INT-01, INT-02, GATE-01, GATE-02

## Objective

Identify implementation and sequencing choices that reduce critical security risk without breaking existing auth -> fetch -> parse -> render behavior.

## Scope Constraints

- No new product capability expansion in this phase.
- Script execution stays enabled for compatibility, but must be hardened.
- Backend owns workflow/auth/state; frontend callback logic must align to backend validation contract.
- Preserve deterministic error contracts and integration backward compatibility.

## High-Risk Surfaces and Required Hardening

### 1. OAuth callback/state integrity (SEC-02, INT-02)

Primary files:
- `core/auth/oauth_auth.py`
- `core/api.py`
- `ui-react/src/components/auth/OAuthCallback.tsx`

Required patterns:
- Replace predictable/multi-use state with high-entropy, single-use, short-lived state.
- Persist server-side state binding tuple: `{source_id, redirect_uri, code_verifier, expires_at}`.
- Reject code exchange when state is missing, expired, reused, or mismatched.
- Remove frontend fallback behavior that infers source from local-only hints when server state validation is required.

Compatibility note:
- Keep existing success/failure response shape stable where possible; only tighten invalid-input paths.

### 2. Interaction source isolation and secret write boundary (SEC-01, SEC-02)

Primary files:
- `core/api.py`
- `core/executor.py`
- `core/models.py` (if interaction schema updates are needed)

Required patterns:
- Route `source_id` is the only write target for `/api/sources/{source_id}/interact`.
- Remove or ignore request-body `source_id` override behavior.
- Require matching pending interaction by source + expected interaction type.
- Whitelist accepted interaction keys using pending interaction field definitions; reject or ignore extras.

Compatibility note:
- Keep existing integration UX, but fail unsafe submissions deterministically.

### 3. Script/parser execution boundary hardening (SEC-03, INT-02)

Primary files:
- `core/steps/script_step.py`
- `core/parser.py`
- `core/executor.py`

Required patterns:
- Enforce parser/script path allowlist rooted in approved integration directories.
- Disallow arbitrary absolute paths and parent traversal.
- Constrain execution policy (imports/builtins/time/IO) while preserving current script-dependent integrations.
- Avoid logging full script source and sensitive input payloads.

Compatibility note:
- Start with deny-dangerous defaults and controlled compatibility exceptions, not feature removal.

### 4. HTTP outbound URL policy and SSRF boundary (SEC-03)

Primary files:
- `core/steps/http_step.py`

Required patterns:
- Block loopback, link-local, private-network, and file/prohibited protocols by default.
- Allow explicit opt-in exceptions only via trusted config path.
- Normalize and validate targets before dispatch.

Compatibility note:
- Keep standard HTTPS API integrations functioning without config churn.

### 5. Secret redaction and sensitive endpoint hygiene (SEC-01, INT-01)

Primary files:
- `core/api.py`
- `core/auth/oauth_auth.py`
- `core/steps/script_step.py`
- internal scraper endpoints and integration file API handlers

Required patterns:
- Centralized redaction helper covering token/secret/code/client_secret/device_code and equivalent keys.
- Remove raw OAuth payload/response logging and credential-bearing bodies.
- Internal scraper endpoints require service authentication (not localhost-only trust).
- Integration file APIs return logical identifiers, not absolute filesystem paths.

Compatibility note:
- Preserve troubleshooting value via safe metadata-only logs.

## Sequencing Recommendation for Planning

1. Security utility foundation: shared validators/redaction/URL policy primitives.
2. OAuth + interact endpoint hardening.
3. Script/parser/http execution boundary hardening.
4. Regression + security gate documentation and verification artifacts.

Rationale: reduces duplicate patching and supports parallel work with minimal file conflicts.

## Test and Regression Strategy

- Use focused backend tests for each critical surface plus end-to-end regression for auth/fetch/refresh.
- Reuse and extend existing tests where available:
  - `tests/api/test_oauth_interaction_api.py`
  - `tests/core/test_scraper_internal_api.py`
  - frontend callback tests under `ui-react/src/components/auth/`
- Keep rejection behavior deterministic (`HTTPException` status + stable `detail` semantics).

## Planning Risks

- Over-hardening that breaks existing integrations (especially script/import behavior).
- Hidden coupling between frontend callback assumptions and backend auth state rules.
- Inconsistent redaction application if call-site-only edits are used.

Mitigation:
- Put shared security utilities behind central helpers and enforce via tests.
- Include compatibility-focused regression gates in a dedicated plan.

## Validation Architecture

### Validation Goals

- Prove all Phase 3 security requirements are covered by executable checks.
- Keep feedback fast during implementation while preserving full regression confidence before phase verification.

### Test Stack

- Backend framework: `pytest` (existing project setup)
- Frontend framework: `vitest` (existing `ui-react` test setup)

### Command Sampling Contract

- Quick loop during plan execution:
  - `make test-impacted`
- Phase wave/full regression:
  - `make test-backend`
  - `make test-frontend`
  - `make test-typecheck` (when TypeScript callback/API contract changes)

### Requirement-to-Verification Mapping

- SEC-01: redaction and secret exposure tests for logs/API payload shaping.
- SEC-02: deterministic malformed input rejection tests for OAuth/interact endpoints.
- SEC-03: URL/path sandbox and unsafe target rejection tests in HTTP/script/parser paths.
- INT-01: sanitized error output tests (no sensitive internals leaked).
- INT-02: compatibility regressions for existing auth/fetch/refresh happy paths.
- GATE-01: targeted critical-flow regression suite remains green.
- GATE-02: explicit security release gate checklist and pass/fail evidence file exists.

### Nyquist-Oriented Expectations

- Every plan task should include automated verification hooks or explicit Wave 0 dependency declaration.
- No phase completion claim without repeatable command-level evidence tied to requirement IDs.

## Research Conclusion

Phase 3 should be planned as multiple focused execution plans with clear ownership boundaries and a final gate plan that proves remediation completeness and regression safety.
