# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- **Backend:** `pytest` is the repository-wide runner for Python code.
- **Frontend:** `Vitest` is used for frontend React code, along with `@testing-library/react`.
- **Scripts:** Shell scripts (`scripts/test_backend_core.sh`, `scripts/test_frontend_core.sh`, `scripts/test_impacted.sh`) orchestrate the CI/CD gates.

**Assertion Library:**
- Python uses standard `assert` with `pytest` and `unittest.mock.MagicMock`.
- Frontend uses `expect` from Vitest/testing-library.

**Run Commands (via Makefile):**
```bash
make test-backend           # Run backend core tests via pytest
make test-frontend          # Run frontend core tests via Vitest
make test-typecheck         # Run frontend tests with typecheck
make test-impacted          # Run impacted-only gate by changed files
```

## Test File Organization

**Location:**
- Backend tests at `tests/`
- Frontend tests at `ui-react/tests/` or alongside components in `ui-react/src/`
- Smoke and E2E tests at `tests/smoke/`

**Structure:**
```
tests/
  api/
  core/
  smoke/
ui-react/
  tests/
```

## Test Structure

**Suite Organization:**
- Backend uses `pytest` fixtures and markers.
- Frontend uses standard `describe`/`it` blocks in TypeScript.

## Mocking

**Framework:**
- Backend: `unittest.mock` (`MagicMock`, `patch`) and `pytest-mock`.
- Frontend: `vi.mock()` from Vitest.

**Patterns:**
- Mock persistence and secret dependencies when validating executor state transitions.
- Frontend components mock API calls using MSW or Vitest mocks.

## Coverage

**Requirements:**
- Core modules require TDD processes, emphasizing code that handles integration logic, user flows, and secrets.

## Test Types

**Unit Tests:**
- Validate discrete functions, React components, and individual step logic execution.

**Integration Tests:**
- Validate API endpoints and interactions with persistence layers (e.g., SQLite/TinyDB).

**E2E Tests:**
- Smoke tests validate minimal path operations using Playwright or end-to-end API validations.
