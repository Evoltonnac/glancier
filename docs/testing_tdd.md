# Testing and TDD Policy (Condensed)

This file defines the current release-blocking test gates.
Detailed failure examples: [flow/04_step_failure_test_inputs.md](./flow/04_step_failure_test_inputs.md)

## 1. Required Coverage

- Backend core: high-risk auth/runtime paths in `core/executor.py`, `core/source_state.py`, `core/encryption.py`, `core/api.py`
- Frontend core: key interaction/state flows covered by `Vitest + React Testing Library`

## 2. Backend TDD Rules

- Standard cycle: `RED -> GREEN -> REFACTOR`
- Behavior changes in core paths must include reproducible pytest coverage
- Emergency fixes may land first, but regression tests must be added in the same delivery

## 3. Blocking Commands

| Layer | Command | Purpose |
| --- | --- | --- |
| Backend | `make test-backend` | Backend core gate |
| Backend | `python -m pytest tests -q -k "interaction or auth or encryption"` | High-risk regression gate |
| Frontend | `make test-frontend` | Frontend behavior gate |
| Frontend | `make test-typecheck` | TS type gate |
| Cross-layer | `make test-impacted` | Change-driven gate |

## 4. Test Organization Constraints

- Reuse `tests/conftest.py` and `tests/factories/`
- Tests must be repeatable, network-free, and avoid timing race dependence
- Prefer behavior assertions for blocking paths; avoid brittle snapshots
