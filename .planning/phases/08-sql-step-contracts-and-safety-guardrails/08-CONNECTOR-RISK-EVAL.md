# Phase 8 Connector Risk Evaluation: SQL / Mongo / GraphQL

**Created:** 2026-03-24  
**Scope:** Security policy alignment for risky data-operation steps

## 1. Goal

Define a reusable risk-classification and authorization fallback contract so risky operations are never executed silently.

Shared policy target:
- Detect operation risk class before execution.
- Route high-risk operations to existing authorization wall.
- Execute only after explicit user decision (`allow_once`, `allow_always`, `deny`).

## 2. SQL (Phase 8 implementation target)

### Detection method
- Use SQLGlot AST classification.

### Risk classes
- Low risk: pure read operations (`SELECT`, read-only CTE chains).
- High risk: write/mutation/DDL/multi-statement patterns (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `ALTER`, `DROP`, etc.).
- Unknown parse state: fail-safe classification as high risk.

### Fallback behavior
- High-risk or unknown -> emit trust-required interaction.
- `deny` -> deterministic blocked error.
- `allow_once` / `allow_always` -> proceed under existing trust-rule protocol.

## 3. Mongo (evaluation for follow-up phase)

### Candidate detection signals
- Command/operator names: `insert*`, `update*`, `delete*`, `findAndModify`, bulk write APIs.
- Pipeline stages with write side effects: `$out`, `$merge`.

### Risk classes
- Low risk: read-only query ops (`find`, `aggregate` without write stages).
- High risk: writes and side-effecting stages.
- Unknown command shape: classify as high risk.

### Fallback behavior
- Reuse same authorization-wall protocol as SQL high-risk operations.
- If classifier parsing fails or operation shape is ambiguous, classify as `unknown` and require trust before execution (fail-safe).

## 4. GraphQL (evaluation for follow-up phase)

### Candidate detection signals
- Operation type parsed from GraphQL AST: `query`, `mutation`, `subscription`.

### Risk classes
- Low risk: `query`.
- High risk: `mutation` and `subscription` (stateful/side-effect or long-lived behavior).
- Unknown parse state: classify as high risk.

### Fallback behavior
- Reuse same authorization-wall protocol as SQL high-risk operations.
- If AST parsing fails or operation kind cannot be resolved, classify as `unknown` and require trust before execution (fail-safe).

## 5. Shared Contract Proposal

### Runtime-level decisions
- `risk_class`: `low | high | unknown`
- `requires_trust`: boolean
- `capability`: connector capability key (for trust-rule persistence domain)
- `target_key`: normalized operation fingerprint for trust scoping

Suggested connector capability keys for parity planning:
- SQL: `sql`
- Mongo: `mongo`
- GraphQL: `graphql`

### Deterministic outcomes
- trust required -> suspended interaction state with stable `error_code`
- trust denied -> blocked state with stable `error_code`
- trust allowed -> continue execution

## 6. Authoring Policy (AI Prompt/Skill)

- Default guidance: avoid write operations unless explicitly required by user intent.
- If writes are necessary, explain risk and declare that runtime trust authorization is required.
- Never present risky operations as "safe by default".

## 7. Phase Mapping

- Phase 8: SQL AST classification + trust-gate integration (implementation)
- Phase 9+: Mongo/GraphQL equivalent classifiers and runtime adapters (follow-up)
