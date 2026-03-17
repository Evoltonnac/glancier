# Quick Task 260317-uyq Summary

**Description:** 处理网络超时错误码：后端新增专用异常并补齐前端i18n映射

**Date:** 2026-03-17
**Commit:** 9769aa1

---

## Changes Made

### 1. Backend timeout classification and propagation
- Added `NetworkTimeoutError` in `core/executor.py` with code `runtime.network_timeout`.
- Added `_classify_http_network_error(...)` in executor to map HTTP timeout exceptions (`ConnectTimeout`, `ReadTimeout`, `WriteTimeout`, `PoolTimeout`) to `NetworkTimeoutError`.
- Updated flow execution guard so `NetworkTimeoutError` bypasses generic `FlowExecutionError` wrapping.
- Updated interaction error normalization to preserve `NetworkTimeoutError` as-is.
- Updated `core/steps/http_step.py` retry-exhausted path to call executor network classifier and raise classified error.

### 2. Backend tests
- `tests/core/test_http_step.py`
  - Retry-exhausted timeout now asserts `NetworkTimeoutError` and `runtime.network_timeout`.
- `tests/core/test_scraper_states.py`
  - Added executor-level regression test that timeout failures persist `error_code = runtime.network_timeout`.

### 3. Frontend i18n for timeout code
- Added dedicated timeout copy keys in both locales:
  - `error.copy.runtime.network_timeout.title`
  - `error.copy.runtime.network_timeout.description`
  - `error.code.runtime.network_timeout`
- Files:
  - `ui-react/src/i18n/messages/en.ts`
  - `ui-react/src/i18n/messages/zh.ts`

---

## Verification

- `pytest -q tests/core/test_http_step.py tests/core/test_scraper_states.py` -> passed (`9 passed`)
- `make test-backend` -> passed (`29 passed`)
- `make test-frontend` -> passed (`31 passed`)
- `make test-typecheck` -> passed (frontend core tests + `tsc --noEmit`)

---

## Files Modified

| File | Changes |
|------|---------|
| `core/executor.py` | Added `NetworkTimeoutError`, network-timeout classifier, timeout pass-through handling |
| `core/steps/http_step.py` | Classified retry-exhausted network errors via executor helper |
| `tests/core/test_http_step.py` | Updated timeout regression assertions |
| `tests/core/test_scraper_states.py` | Added timeout error-code persistence test |
| `ui-react/src/i18n/messages/en.ts` | Added runtime timeout copy/code messages |
| `ui-react/src/i18n/messages/zh.ts` | Added runtime timeout copy/code messages |
