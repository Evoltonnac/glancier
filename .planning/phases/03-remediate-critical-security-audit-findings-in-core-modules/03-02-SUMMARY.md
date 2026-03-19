---
phase: 03-remediate-critical-security-audit-findings-in-core-modules
plan: 02
subsystem: runtime-security
tags: [http, parser, script, ssrf, path-policy, security]
requires: [03-01-PLAN.md]
provides:
  - "HTTP step preflight rejects private/link-local/loopback targets and unsupported schemes with deterministic error codes."
  - "Unused parser module has been removed from the runtime codebase to avoid dead security surface area."
  - "Script step remains inline-code only and no longer logs raw script bodies on execution errors."
affects: [03-03-PLAN.md, 03-04-PLAN.md, core/steps/http_step.py, core/steps/script_step.py]
tech-stack:
  added: []
  patterns:
    - "Outbound target validation runs before HTTP client creation."
    - "Dead runtime surface is reduced by removing unused parser module code."
key-files:
  created:
    - .planning/phases/03-remediate-critical-security-audit-findings-in-core-modules/03-02-SUMMARY.md
  modified:
    - core/steps/http_step.py
    - core/steps/script_step.py
    - tests/core/test_http_step.py
  deleted:
    - core/parser.py
    - tests/core/test_parser_security.py
key-decisions:
  - "Use deterministic RuntimeError codes for blocked HTTP targets: http_target_blocked_private and http_target_blocked_scheme."
  - "Remove parser module because there is no parser step in the runtime execution chain."
  - "Keep script-step contract unchanged: execute only inline `args.code`, no file-path loading API."
patterns-established:
  - "Security tests assert exact rejection identifiers instead of loose message matching."
requirements-completed: [SEC-03, INT-02]
duration: 24min
completed: 2026-03-19
---

# Phase 03 Plan 02: HTTP/Parser/Script Boundary Hardening Summary

**Phase 03 plan2 completed: HTTP target preflight guards are in place, script step remains inline-code only, and unused parser module has been removed.**

## Verification

Executed commands:

1. `pytest tests/core/test_http_step.py -k "target_blocked_private or target_blocked_scheme"` (pass)
2. `pytest tests/core/test_http_step.py` (pass)
3. `make test-impacted` (pass)
4. `make test-backend` (pass)

## Accomplishments

- Added `_validate_http_target_url` in `core/steps/http_step.py` and invoked it before any `httpx.AsyncClient` request.
- Added deterministic blocking for:
  - loopback/private/link-local IP targets (e.g. `127.0.0.1`, `169.254.169.254`)
  - unsupported schemes (e.g. `file://`, `ftp://`, empty/invalid)
- Removed unused parser module (`core/parser.py`) and its dedicated security regression file (`tests/core/test_parser_security.py`) because runtime does not execute parser step code.
- Hardened script step in `core/steps/script_step.py`:
  - keeps inline `args.code` execution contract only
  - removed raw script-source logging from error path
- Added regression coverage in:
  - `tests/core/test_http_step.py`

## Task Commits

1. Task 1 (HTTP target policy): `3a8cef8`
2. Task 2 (script-step logging hardening + parser removal follow-up): `d7b295e`, `dfc9608`
3. Task 3 (HTTP security regression tests): `999372f`
4. Plan metadata/state update: `d9dfb2a`, `f4e224b`

## Deviations from Plan

- Removed undocumented `script_step` file-path loading behavior and reverted to inline-only `args.code` contract.
- Removed dead parser module although it was present in the original plan artifacts.

## Next Phase Readiness

- Plan 02 is complete and validated.
- Phase 03 is ready to continue with `03-03-PLAN.md`.
