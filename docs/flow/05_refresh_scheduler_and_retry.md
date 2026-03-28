# Refresh Scheduler and Retry Architecture

## 1. Scope and Ownership

This document defines backend runtime policy for periodic refresh and bounded retry.

Owner boundaries:
- Backend scheduler owns refresh cadence, retry timing, and queue execution.
- Flow/executor owns state transitions and deterministic `error_code` outputs.
- Frontend and WebView runtime are observers/manual action entry points, not retry-policy owners.

Primary implementation paths:
- `core/refresh_scheduler.py`
- `core/data_controller.py`
- `core/executor.py`

## 2. Scheduler Execution Model

`RefreshScheduler` runs as a single periodic loop:
1. Tick scans source latest records from `DataController`.
2. Tick decides whether each source is due for auto refresh or retry.
3. Eligible sources are enqueued with dedupe (`_queued_ids` + `_inflight_ids`).
4. Worker dequeues and executes refresh sequentially.

Design intent:
- Avoid duplicate work under frequent ticks.
- Keep scheduling decisions deterministic from persisted state.
- Keep retry behavior independent from UI route/activity.

## 3. Auto-Refresh (Interval) Path

For `active` sources, due-time is derived from:
1. Source-level `refresh_interval_minutes`
2. Integration-level `default_refresh_interval_minutes`
3. Global settings `refresh_interval_minutes`

Resolution helper: `resolve_refresh_interval_minutes`.

A source is due when:
- effective interval > 0, and
- `now - last_success_at >= effective_interval * 60`.

## 4. Retry Path (Retryable Runtime Failures)

For non-active latest states (`error` / `suspended`), scheduler may enqueue bounded retries only for retryable runtime signatures.

Current retryable runtime signatures:
- `runtime.retry_required`
- `runtime.network_timeout`

Manual-required auth failures (for example `auth.manual_webview_required`) are excluded from auto retry.

## 5. Retry State Contract (`retry_metadata`)

Retry progression is persisted per source latest record as `retry_metadata`:
- `signature`: current retryable runtime signature.
- `attempts`: completed retry attempts for this signature.
- `first_failed_at`: first failure timestamp in current retry window.
- `next_retry_at`: next allowed retry time.

Storage and lifecycle helpers:
- Write/clear via `DataController.set_retry_metadata` and `clear_retry_metadata`.
- Scheduler also keeps an in-memory cache for runtime efficiency.

Key rule:
- Retry budget is keyed by `source_id + signature`, not by generic `updated_at` changes.

## 6. Backoff and Attempt Cap

Backoff sequence is fixed:
- Attempt 1 window: `60s`
- Attempt 2 window: `180s`
- Attempt 3 window: `600s`

Maximum automatic retries per signature window: `3`.

After cap is reached, scheduler stops automatic enqueue for that signature window until reset conditions are met.

## 7. Reset Conditions

Retry metadata resets only when one of these is true:
1. A newer success is recorded (`last_success_at > first_failed_at`).
2. Retry signature changes to a different runtime code.

These transitions must not reset budget by themselves:
- `error` <-> `suspended` churn under same signature.
- `updated_at` churn without success/signature change.

## 8. Queue Safety and Determinism

Scheduler invariants:
- A source cannot be enqueued twice while queued/inflight.
- Retry and interval-based auto refresh both pass through the same queue ownership model.
- Decisions are made from latest persisted records, not UI transient state.

## 9. Observability and Debug Checklist

When diagnosing retry-loop regressions, verify:
1. Latest record `error_code` and `status`.
2. `retry_metadata.signature` and `attempts` progression.
3. `next_retry_at` monotonic progression across backoff windows.
4. Presence/absence of success boundary (`last_success_at`).
5. Queue dedupe state (no duplicate source enqueue).

## 10. Related Documents

- Flow architecture: [01_architecture_and_orchestration.md](01_architecture_and_orchestration.md)
- Failure scenario inputs: [04_step_failure_test_inputs.md](04_step_failure_test_inputs.md)
- WebView runtime fallback (high-level): [../webview-scraper/02_runtime_and_fallback.md](../webview-scraper/02_runtime_and_fallback.md)

## 11. SQL Guardrail Runtime Contract

SQL step execution has deterministic timeout and row-limit guardrails. Threshold resolution order is:
1. Source override (`args.timeout` / `args.max_rows`, including source-variable substitution)
2. System settings defaults (`sql_default_timeout_seconds`, `sql_default_max_rows`)
3. SQL runtime built-ins (`30s`, `500 rows`)

Runtime outcomes:
- timeout breach -> `runtime.sql_timeout`
- row-limit breach does not fail the step; response is normalized with `sql_response.truncated=true` and `sql_response.row_count <= sql_response.max_rows`
- canonical timing metadata is `sql_response.duration_ms` (`sql_response.execution_ms` remains a compatibility alias)

Retry policy note:
- SQL timeout and contract/trust failures are deterministic, not transient transport failures.
- They are intentionally not included in the automatic retry signature allowlist in Section 4.
- Successful but truncated SQL responses (`sql_response.truncated=true`) are not failures and must not trigger retry metadata.

## 12. MongoDB and Redis Runtime Contract Notes

MongoDB (`use: mongodb`) and Redis (`use: redis`) step failures are also deterministic backend error surfaces:
- MongoDB: `runtime.mongo_invalid_contract`, `runtime.mongo_connect_failed`, `runtime.mongo_auth_failed`, `runtime.mongo_query_failed`, `runtime.mongo_timeout`
- Redis: `runtime.redis_invalid_contract`, `runtime.redis_connect_failed`, `runtime.redis_auth_failed`, `runtime.redis_query_failed`, `runtime.redis_timeout`

Retry policy note:
- These deterministic contract/connect/auth/query/timeout errors are not part of Section 4 retryable signature allowlist.
