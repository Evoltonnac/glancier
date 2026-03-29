# Testing and TDD Policy

This file defines the current release-blocking test gates.
Detailed failure examples: [flow/04_step_failure_test_inputs.md](./flow/04_step_failure_test_inputs.md)

## 1. Required Coverage

- Backend core: high-risk auth/runtime paths in `core/executor.py`, `core/source_state.py`, `core/encryption.py`, `core/api.py`
- Frontend core: key interaction/state flows covered by `Vitest + React Testing Library`

## 2. Core TDD Expectations

- Standard cycle: `RED -> GREEN -> REFACTOR`
- Start from a focused failing test first when practical, especially for regressions in core paths and user-visible behavior.
- Behavior changes in core paths must include reproducible pytest coverage
- Emergency fixes may land first, but regression tests must be added in the same delivery
- Prefer the smallest focused test that proves the behavior before relying only on broad suite coverage.

## 3. Change-Driven Minimum Gates

| Layer | Command | Purpose |
| --- | --- | --- |
| Backend | `make test-backend` | Backend core gate |
| Backend | `python -m pytest tests -q -k "interaction or auth or encryption"` | High-risk regression gate |
| Frontend | `make test-frontend` | Frontend behavior gate |
| Frontend | `make test-typecheck` | TS type gate |
| Cross-layer | `make test-impacted` | Change-driven gate |

Typical trigger guidance:
- `core/executor.py`, `core/api.py`, auth, encryption, storage, migration, or retry behavior changes: run `make test-backend` and the focused high-risk pytest gate when relevant.
- Frontend interaction, dashboard state, or rendering behavior changes: run `make test-frontend`.
- Type-sensitive UI, editor/schema-fed UI, or changed TS contracts: run `make test-typecheck`.
- Mixed backend/frontend or broad contract changes: run `make test-impacted`.
- Step-contract or integration-schema changes are not complete until schema artifacts are regenerated through `make gen-schemas` and impacted validation is rerun.

## 4. Test Organization Constraints

- Reuse `tests/conftest.py` and `tests/factories/`
- Tests must be repeatable, network-free, and avoid timing race dependence
- Prefer behavior assertions for blocking paths; avoid brittle snapshots

## 5. Delivery Expectations

- Keep the regression test and the implementation change in the same delivery.
- Report which focused tests and which gate commands were run.
- If a relevant gate is skipped, state why and identify the remaining risk explicitly.
