---
status: resolved
trigger: "Investigate issue: db-risk-prompts-multi-gate-loop"
created: 2026-03-29T09:07:06Z
updated: 2026-03-29T11:16:10Z
---

## Current Focus

hypothesis: DB semantic risk uses the HTTP/network trust confirm contract, and the trust policy stores allow-once approvals as single-use ephemeral keys with no interaction-chain scope.
test: Compare HTTP trust prompting with SQL risk prompting, then inspect the trust-policy state machine and API interaction payload handling.
expecting: SQL emits `confirm_kind=network_trust` with connector-profile data instead of DB-risk-specific data, there is no DB DSN/URI trust phase in current DB steps, and `_consume_allow_once()` removes approval before the rerun chain finishes.
next_action: Inspect DSN/URI parsing paths for SQL/MongoDB/Redis and design the minimal confirm contract needed for phase-split DB prompts.

## Symptoms

expected: DB steps should split risk authorization into at least two phases. Phase 1 checks DSN/URI target classification for private/loopback addresses and prompts for network trust if needed. After that passes, phase 2 performs semantic/static risk checks (for example SQL write operations) and prompts with a DB-write-specific risk message. When both are approved, the step executes normally. If a step has multiple risk gates, allow-once approvals already granted in the same interaction chain must remain effective until the step finishes, so the user is not bounced back to earlier prompts.
actual: SQL write-risk prompts still render as private/loopback network trust prompts because the backend emits the same confirm_kind/data shape. Also, allow-once approvals are consumed too early, so when a later risk gate in the same step triggers and the step reruns, the earlier approval can be lost and the user gets stuck in a prompt loop.
errors: Wrong prompt content for SQL write risk; repeated prompt loop for multi-risk steps using allow_once.
reproduction: Use config/integrations/test_db_risk_prompts.local.yaml and exercise a risky DB step. Observe that the write-risk prompt uses private/loopback network wording. Consider a step containing both DSN/URI trust check and semantic risk check; approving the first once and then the second once causes the step to rerun and hit the first prompt again.
started: Regression/design gap in current DB trust/risk implementation.

## Eliminated

## Evidence

- timestamp: 2026-03-29T09:12:40Z
  checked: .planning/debug/knowledge-base.md
  found: No knowledge-base entry existed for this symptom pattern.
  implication: No prior resolved session can be reused as a direct hypothesis shortcut.

- timestamp: 2026-03-29T09:12:40Z
  checked: core/steps/sql_step.py and core/executor.py
  found: SQL semantic risk builds interaction data with `confirm_kind="network_trust"` and the executor preserves that confirm kind when converting `SqlRiskOperationTrustRequiredError` into `InteractionType.CONFIRM`.
  implication: SQL write-risk prompts are structurally indistinguishable from HTTP private/loopback trust prompts in the current interaction contract.

- timestamp: 2026-03-29T09:12:40Z
  checked: ui-react/src/components/auth/FlowHandler.tsx and ui-react/src/components/auth/FlowHandler.test.tsx
  found: The frontend only has specialized confirm rendering/submission logic for `confirm_kind === "network_trust"`.
  implication: Even if backend error codes differ, the UI must treat SQL risk prompts as network-trust prompts because no DB-specific confirm kind exists.

- timestamp: 2026-03-29T09:12:40Z
  checked: core/network_trust/policy.py
  found: `evaluate()` calls `_consume_allow_once()`, and `_consume_allow_once()` removes the ephemeral approval immediately on first match.
  implication: An allow-once approval cannot survive a later rerun in the same step when multiple trust/risk gates are encountered sequentially.

- timestamp: 2026-03-29T09:12:40Z
  checked: rg search across core/tests for DB trust and DSN classification
  found: HTTP has explicit private/loopback target classification in `core/steps/http_step.py`, but SQL/MongoDB/Redis currently only expose SQL semantic trust or no DB trust gate at all; there is no existing DB DSN/URI network classification path.
  implication: The expected two-phase DB authorization flow is a missing runtime feature, not just a prompt-copy mismatch.
## Resolution

root_cause:
  1. SQL semantic-risk confirm payload reused `confirm_kind=network_trust`, so UI could not distinguish DB operation risk from network trust prompts.
  2. `NetworkTrustPolicy` consumed allow-once grants during evaluation, which broke multi-gate reruns within one fetch chain.
  3. DB steps lacked a shared DSN/URI private-loopback trust gate before operation-level risk checks.
fix:
  1. Added database target classifier and shared DB trust gate (`core/network_trust/database.py`, `core/steps/db_trust.py`) and wired SQL/MongoDB/Redis to enforce DSN/URI trust checks.
  2. Switched SQL operation-risk prompt contract to `confirm_kind=db_operation_risk` and updated API error-code inference/UI rendering for the new confirm kind.
  3. Changed allow-once behavior to persist for the full source fetch chain and clear only when fetch completes successfully/non-suspended.
verification:
  1. `make test-impacted` passed.
  2. New/updated regression tests cover: SQL multi-gate allow-once retry, DB operation risk interaction contract, MongoDB/Redis private target trust gate, and FlowHandler db risk prompt rendering/submission.
files_changed:
  - core/network_trust/database.py
  - core/steps/db_trust.py
  - core/steps/sql_step.py
  - core/steps/mongodb_step.py
  - core/steps/redis_step.py
  - core/network_trust/policy.py
  - core/executor.py
  - core/api.py
  - ui-react/src/components/auth/FlowHandler.tsx
