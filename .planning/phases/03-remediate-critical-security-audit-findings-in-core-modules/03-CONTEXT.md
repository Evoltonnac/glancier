# Phase 3: remediate-critical-security-audit-findings-in-core-modules - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 is limited to remediating critical/high security audit findings in existing core modules while preserving the current config-first auth -> fetch -> parse -> render behavior. This phase hardens validation, isolation boundaries, and sensitive-data handling. It does not add new product capabilities.

</domain>

<decisions>
## Implementation Decisions

### 1. OAuth callback integrity and code exchange binding
- Replace predictable OAuth `state` with high-entropy, single-use, short-lived state values.
- Bind OAuth state server-side to `source_id`, `redirect_uri`, and PKCE verifier; reject mismatches deterministically.
- Enforce state verification during `oauth_code_exchange`; no state-less success path for code flow.
- Frontend callback must not infer source from `hash`/`localStorage` when server state validation is required for completion.

### 2. Interaction API source isolation and write authorization
- `/api/sources/{source_id}/interact` must use the route `source_id` as the only write target.
- Remove request-body `source_id` override behavior.
- Reject interaction submissions when no matching pending interaction exists for the same source and expected interaction type.
- Restrict persisted keys to the pending interaction field whitelist; ignore or reject extra keys.

### 3. Untrusted execution and network boundary controls
- Script execution capability remains enabled in this phase (no default disable), because existing integrations depend on it.
- Introduce hardening for script execution with sandboxing controls and explicit trust boundaries.
- Add strict path allowlist constraints for parser/scripts; disallow arbitrary absolute/local path loading outside approved directories.
- Add execution-policy controls (allowed imports/builtins/resource limits/timeout/IO boundaries) to reduce RCE blast radius while preserving compatibility.
- Add outbound URL policy for HTTP step: block loopback/link-local/private targets by default, with explicit allowlist exceptions only.

### 4. Secret leakage prevention in logs, APIs, and runtime APIs
- Apply centralized redaction for token/secret/code/client_secret/device_code fields across auth, API, and step logs.
- Remove logging of raw OAuth payloads/responses, full script source, and credential-bearing request bodies.
- Internal scraper APIs require service-to-service authentication in addition to localhost checks (shared secret or equivalent strong mechanism).
- Integration file APIs must not expose absolute filesystem paths; return logical filenames/IDs only.

### Claude's Discretion
- Exact abstraction shape for redaction helper and whether to enforce redaction at logger adapter vs callsite utilities.
- Exact mechanism for internal endpoint worker authentication (header token vs HMAC) as long as replay-resistant validation is enforced.
- Exact script hardening strategy (in-process restricted executor vs subprocess sandbox) as long as current script-dependent integrations remain functional.
- Exact organization of security tests (new files vs extending existing API/core test modules).

</decisions>

<specifics>
## Specific Ideas

- User-provided static audit findings are the primary decision source for this phase.
- Priority order locked by user:
  1. OAuth state end-to-end validation
  2. Interact cross-source secret write fix
  3. Sandbox/whitelist hardening for script execution (without disabling feature)
  4. Full log redaction
  5. Internal endpoint authentication hardening
- Additional medium/low findings in-scope for this phase: SSRF policy and path exposure controls.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope and Requirements
- `.planning/ROADMAP.md` — Active milestone Phase 3 boundary, requirement mapping, and success criteria.
- `.planning/REQUIREMENTS.md` — SEC-01/SEC-02/SEC-03/INT-01/INT-02/GATE-01/GATE-02 requirements.
- `.planning/STATE.md` — Current milestone status and planning context continuity.

### Project Constraints and Terminology
- `.planning/PROJECT.md` — config-first non-negotiables and architecture constraints.
- `AGENTS.md` — engineering contract, test gate expectations, and scope/quality boundaries.
- `docs/terminology.md` — mandatory domain terminology consistency.

### Security-Sensitive Runtime Surfaces
- `core/api.py` — interaction endpoints, OAuth routes, internal scraper endpoints, integration file API payloads.
- `core/auth/oauth_auth.py` — state generation, PKCE handling, code exchange, device flow logging.
- `core/steps/script_step.py` and `core/parser.py` — dynamic script execution surfaces.
- `core/steps/http_step.py` — outbound request policy enforcement point.
- `ui-react/src/components/auth/OAuthCallback.tsx` — callback source/state handling path.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing OAuth PKCE storage (`oauth_pkce` in `SecretsController`) can be extended to persist state binding metadata and expiry.
- Existing interaction model (`SourceState.interaction` + `InteractionField`) provides a natural whitelist source for accepted interaction keys.
- Existing API test harnesses already cover OAuth interaction and scraper internal endpoints:
  - `tests/api/test_oauth_interaction_api.py`
  - `tests/core/test_scraper_internal_api.py`
  - `ui-react/src/components/auth/OAuthCallback.test.tsx`

### Established Patterns
- Backend APIs return deterministic `HTTPException(status_code, detail)` for malformed requests; phase changes should preserve this pattern.
- Source runtime state is persisted via `Executor._update_state` -> `DataController.set_state`; hardening should avoid breaking refresh/retry orchestration.
- Config and auth are source-scoped across runtime modules; cross-source writes are a boundary violation and must be blocked centrally.

### Integration Points
- OAuth hardening touches both backend (`/oauth/*`, `/sources/{id}/interact`, `OAuthAuth`) and frontend callback (`OAuthCallback`) contract.
- Secret-write boundary fixes concentrate in `interact_source` and any helper path that writes `_secrets.set_secrets(...)`.
- Logging redaction should be introduced as shared utility and applied in `core/auth/oauth_auth.py`, `core/api.py`, and `core/steps/script_step.py`.

</code_context>

<deferred>
## Deferred Ideas

- Full per-integration trust profiles (domain allowlist/capability profile) beyond minimal URL denylist: tracked as v2 SEC-04 follow-up.
- Dedicated security event/audit trail UI: tracked as v2 SEC-05 follow-up.
- Local sensitive file permission hardening (`600/700`) and atomic persistence upgrades are explicitly deferred from this phase by user decision.

</deferred>

---

*Phase: 03-remediate-critical-security-audit-findings-in-core-modules*
*Context gathered: 2026-03-19*
