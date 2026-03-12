---
phase: 15-oauth-refactoring-authlib-integration
plan: 01
status: completed
completed: 2026-03-11
---

# Phase 15 Plan 01 Summary

## One-line Outcome
Replaced manual OAuth HTTP handling with `Authlib AsyncOAuth2Client`, and upgraded `/api/oauth/authorize/{source_id}` to return polymorphic flow payloads.

## Tasks Completed
1. Rebuilt [`core/auth/oauth_auth.py`](/Users/xingminghua/Coding/tools/quota-board/core/auth/oauth_auth.py) around Authlib client lifecycle:
   - Code flow URL generation and PKCE verifier storage.
   - Code exchange via `fetch_token`.
   - Token normalization/persistence with consistent `expires_at` handling.
2. Updated OAuth manager mapping in [`core/auth/manager.py`](/Users/xingminghua/Coding/tools/quota-board/core/auth/manager.py) to parse flow/response/device settings.
3. Updated authorize endpoint contract in [`core/api.py`](/Users/xingminghua/Coding/tools/quota-board/core/api.py) to return `{ flow: ... }` responses.
4. Added Authlib-focused backend tests in [`tests/core/test_oauth_authlib.py`](/Users/xingminghua/Coding/tools/quota-board/tests/core/test_oauth_authlib.py).

## Verification
- `pytest -q tests/core/test_oauth_authlib.py`

## Notes
- JSON token endpoints remain supported via fallback JSON exchange path for non-standard providers.
