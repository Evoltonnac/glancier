# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

**Runner:**
- No dedicated repository-wide runner configured (Not detected)
- Ad-hoc Python script execution in `tests/verify_interactions.py`
- Rust helper exists in `ui-react/src-tauri/src/scraper_test.rs` but no test harness wiring detected

**Assertion Library:**
- Python script uses manual print-based checks plus `unittest.mock.MagicMock` in `tests/verify_interactions.py`

**Run Commands:**
```bash
python tests/verify_interactions.py   # Run interaction verification script
cd ui-react && npm run build          # Compile-time guard for frontend TypeScript
cargo test --manifest-path ui-react/src-tauri/Cargo.toml   # Rust tests (currently no effective suite detected)
```

## Test File Organization

**Location:**
- Separate backend test directory at `tests/`
- No frontend test directory under `ui-react/src`

**Naming:**
- Script-style name: `verify_interactions.py`
- Rust helper: `scraper_test.rs`

**Structure:**
```
tests/
  verify_interactions.py
ui-react/src-tauri/src/
  scraper_test.rs
```

## Test Structure

**Suite Organization:**
```typescript
// No TypeScript test suite pattern detected in repository.
```

**Patterns:**
- Setup pattern: construct `Executor` with mocked dependencies (`tests/verify_interactions.py`)
- Teardown pattern: none explicit (script exits)
- Assertion pattern: branch checks with printed PASS/FAIL in `tests/verify_interactions.py`

## Mocking

**Framework:** `unittest.mock` (`MagicMock`) in `tests/verify_interactions.py`

**Patterns:**
```typescript
// Equivalent behavior in Python script tests:
// - mock secrets_controller.get_secret.return_value = None
// - run executor.fetch_source(source)
// - inspect source state for expected interaction/status
```

**What to Mock:**
- Persistence and secret dependencies when validating executor state transitions (`tests/verify_interactions.py`)

**What NOT to Mock:**
- Not documented; no formal test policy detected

## Fixtures and Factories

**Test Data:**
```typescript
// No reusable fixture/factory module detected.
// SourceConfig instances are built inline in tests/verify_interactions.py.
```

**Location:**
- Inline in `tests/verify_interactions.py`

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# No coverage tool/config detected (pytest-cov, coverage.py, nyc, vitest coverage all not detected)
```

## Test Types

**Unit Tests:**
- Minimal, script-like unit checks around `Executor.fetch_source` interactions in `tests/verify_interactions.py`

**Integration Tests:**
- Not detected

**E2E Tests:**
- Not used (Not detected)

## Common Patterns

**Async Testing:**
```typescript
// Pattern observed in Python:
// asyncio.run(test_api_key_interaction())
// asyncio.run(test_oauth_interaction())
```

**Error Testing:**
```typescript
// Pattern observed in Python:
// simulate missing secrets and validate state.status == SUSPENDED
```

---

*Testing analysis: 2026-02-28*
