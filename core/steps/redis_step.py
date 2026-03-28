"""Redis step runtime execution."""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

from core.log_redaction import sanitize_log_reason
from core.sql.normalization import build_sql_fields, serialize_sql_value

if TYPE_CHECKING:
    from core.config_loader import SourceConfig, StepConfig


_DEFAULT_TIMEOUT_SECONDS = 30.0
_DEFAULT_MAX_ROWS = 500
_MIN_TIMEOUT_SECONDS = 0.1
_MIN_MAX_ROWS = 1
_SUPPORTED_PROFILE = "redis"
_ALLOWED_COMMANDS = {"get", "mget", "hgetall", "lrange", "zrange", "smembers"}
_REQUIRED_RESPONSE_KEYS = (
    "rows",
    "fields",
    "row_count",
    "duration_ms",
    "truncated",
    "command",
    "timeout_seconds",
    "max_rows",
)


class RedisStepRuntimeError(RuntimeError):
    def __init__(
        self,
        *,
        source_id: str,
        step_id: str,
        code: str,
        summary: str,
        details: str,
    ):
        super().__init__(summary)
        self.source_id = source_id
        self.step_id = step_id
        self.code = code
        self.message = summary
        self.summary = summary
        self.details = details


class RedisInvalidContractError(RedisStepRuntimeError):
    pass


class RedisConnectFailedError(RedisStepRuntimeError):
    pass


class RedisAuthFailedError(RedisStepRuntimeError):
    pass


class RedisQueryFailedError(RedisStepRuntimeError):
    pass


class RedisTimeoutError(RedisStepRuntimeError):
    pass


def _normalize_command(args: dict[str, Any]) -> str:
    raw = args.get("command")
    if not isinstance(raw, str):
        return ""
    return raw.strip().lower()


def _normalize_profile(args: dict[str, Any]) -> str | None:
    connector = args.get("connector")
    if not isinstance(connector, dict):
        return None
    profile = connector.get("profile")
    if not isinstance(profile, str):
        return None
    normalized = profile.strip().lower()
    return normalized or None


def _resolve_timeout(args: dict[str, Any]) -> float:
    raw = args.get("timeout", _DEFAULT_TIMEOUT_SECONDS)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = _DEFAULT_TIMEOUT_SECONDS
    return max(value, _MIN_TIMEOUT_SECONDS)


def _resolve_max_rows(args: dict[str, Any]) -> int:
    raw = args.get("max_rows", _DEFAULT_MAX_ROWS)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = _DEFAULT_MAX_ROWS
    return max(value, _MIN_MAX_ROWS)


def _resolve_connection_string(args: dict[str, Any]) -> str:
    for key in ("uri", "dsn"):
        raw_value = args.get(key)
        if not isinstance(raw_value, str):
            continue
        value = raw_value.strip()
        if value:
            return value
    raise ValueError("Redis connection string is required (args.uri or args.dsn).")


def _serialize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _serialize_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_value(item) for item in value]
    if isinstance(value, set):
        return [_serialize_value(item) for item in sorted(value, key=str)]
    return serialize_sql_value(value)


def _columns_from_rows(rows: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for row in rows:
        for key in row.keys():
            if key in seen:
                continue
            seen.add(key)
            ordered.append(key)
    return ordered


def _is_auth_failure(message: str) -> bool:
    lowered = message.lower()
    return any(
        token in lowered
        for token in (
            "wrongpass",
            "authentication required",
            "invalid password",
            "noperm",
            "auth",
        )
    )


def _is_connect_failure(message: str) -> bool:
    lowered = message.lower()
    return any(
        token in lowered
        for token in (
            "connection refused",
            "name or service not known",
            "network is unreachable",
            "timed out",
            "dependency is required",
            "error connecting",
        )
    )


def _normalize_rows_for_command(
    command: str,
    raw_result: Any,
    *,
    key: str | None,
    keys: list[str] | None,
    withscores: bool,
) -> list[dict[str, Any]]:
    if command == "get":
        value = _serialize_value(raw_result)
        if value is None:
            return []
        return [{"key": key, "value": value}]
    if command == "mget":
        resolved_keys = keys or []
        values = list(raw_result or [])
        rows: list[dict[str, Any]] = []
        for idx, item in enumerate(values):
            rows.append(
                {
                    "key": resolved_keys[idx] if idx < len(resolved_keys) else str(idx),
                    "value": _serialize_value(item),
                }
            )
        return rows
    if command == "hgetall":
        payload = raw_result if isinstance(raw_result, dict) else {}
        return [{"field": str(k), "value": _serialize_value(v)} for k, v in payload.items()]
    if command == "lrange":
        items = list(raw_result or [])
        return [{"index": idx, "value": _serialize_value(item)} for idx, item in enumerate(items)]
    if command == "smembers":
        items = sorted(list(raw_result or []), key=str)
        return [{"index": idx, "value": _serialize_value(item)} for idx, item in enumerate(items)]
    if command == "zrange":
        items = list(raw_result or [])
        if withscores:
            rows: list[dict[str, Any]] = []
            for idx, item in enumerate(items):
                if isinstance(item, (tuple, list)) and len(item) == 2:
                    rows.append(
                        {
                            "index": idx,
                            "value": _serialize_value(item[0]),
                            "score": _serialize_value(item[1]),
                        }
                    )
                else:
                    rows.append({"index": idx, "value": _serialize_value(item)})
            return rows
        return [{"index": idx, "value": _serialize_value(item)} for idx, item in enumerate(items)]
    return [{"value": _serialize_value(raw_result)}]


def _run_redis_command(
    *,
    args: dict[str, Any],
    timeout_seconds: float,
    max_rows: int,
) -> dict[str, Any]:
    try:
        import redis
    except ImportError as error:  # pragma: no cover - dependency gate in runtime environments
        raise RuntimeError("redis dependency is required for redis step") from error

    uri = _resolve_connection_string(args)
    client: Any = redis.Redis.from_url(
        uri,
        socket_connect_timeout=timeout_seconds,
        socket_timeout=timeout_seconds,
        decode_responses=True,
    )

    command = _normalize_command(args)
    key = args.get("key")
    keys = args.get("keys")
    if isinstance(keys, list):
        resolved_keys = [str(item) for item in keys]
    else:
        resolved_keys = None
    withscores = bool(args.get("withscores", True))

    if command == "get":
        if not isinstance(key, str) or not key:
            raise ValueError("Redis key is required for command=get.")
        raw_result = client.get(key)
    elif command == "mget":
        if not resolved_keys:
            raise ValueError("Redis keys array is required for command=mget.")
        raw_result = client.mget(resolved_keys)
    elif command == "hgetall":
        if not isinstance(key, str) or not key:
            raise ValueError("Redis key is required for command=hgetall.")
        raw_result = client.hgetall(key)
    elif command == "lrange":
        if not isinstance(key, str) or not key:
            raise ValueError("Redis key is required for command=lrange.")
        start = int(args.get("start", 0))
        stop = int(args.get("stop", max_rows - 1))
        raw_result = client.lrange(key, start, stop)
    elif command == "smembers":
        if not isinstance(key, str) or not key:
            raise ValueError("Redis key is required for command=smembers.")
        raw_result = client.smembers(key)
    elif command == "zrange":
        if not isinstance(key, str) or not key:
            raise ValueError("Redis key is required for command=zrange.")
        start = int(args.get("start", 0))
        stop = int(args.get("stop", max_rows - 1))
        raw_result = client.zrange(key, start, stop, withscores=withscores)
    else:
        raise ValueError(
            f"Unsupported Redis command: {command or 'unknown'}. "
            f"Allowed: {', '.join(sorted(_ALLOWED_COMMANDS))}."
        )

    rows = _normalize_rows_for_command(
        command,
        raw_result,
        key=key if isinstance(key, str) else None,
        keys=resolved_keys,
        withscores=withscores,
    )
    has_more = len(rows) > max_rows
    normalized_rows = rows[:max_rows]
    fields = build_sql_fields(_columns_from_rows(normalized_rows), normalized_rows, db_type_hints={})
    return {
        "rows": normalized_rows,
        "fields": fields,
        "truncated": has_more,
        "command": command,
    }


def _validate_contract(args: dict[str, Any]) -> None:
    profile = _normalize_profile(args)
    if profile is not None and profile != _SUPPORTED_PROFILE:
        raise ValueError(f"Unsupported Redis connector profile: {profile}")
    _resolve_connection_string(args)
    command = _normalize_command(args)
    if command not in _ALLOWED_COMMANDS:
        raise ValueError(
            "Redis command is required and must be one of: "
            + ", ".join(sorted(_ALLOWED_COMMANDS))
            + "."
        )


def _map_runtime_error(
    *,
    source_id: str,
    step_id: str,
    reason: Exception,
) -> RedisStepRuntimeError:
    reason_text = sanitize_log_reason(reason)
    if _is_auth_failure(reason_text):
        return RedisAuthFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.redis_auth_failed",
            summary="Redis authentication failed.",
            details=reason_text,
        )
    if _is_connect_failure(reason_text):
        return RedisConnectFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.redis_connect_failed",
            summary="Redis connection failed.",
            details=reason_text,
        )
    return RedisQueryFailedError(
        source_id=source_id,
        step_id=step_id,
        code="runtime.redis_query_failed",
        summary="Redis query execution failed.",
        details=reason_text,
    )


def _validate_response_contract(
    *,
    source_id: str,
    step_id: str,
    response: dict[str, Any],
) -> None:
    missing = [key for key in _REQUIRED_RESPONSE_KEYS if key not in response]
    if missing:
        raise RedisQueryFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.redis_query_failed",
            summary="Redis query execution failed.",
            details=f"Redis response missing keys: {', '.join(sorted(missing))}",
        )


async def execute_redis_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: dict[str, Any],
    context: dict[str, Any],
    outputs: dict[str, Any],
    executor: Any,
) -> dict[str, Any]:
    _ = (context, outputs, executor)
    try:
        _validate_contract(args)
    except Exception as error:
        raise RedisInvalidContractError(
            source_id=source.id,
            step_id=step.id,
            code="runtime.redis_invalid_contract",
            summary="Redis step contract is invalid.",
            details=sanitize_log_reason(error),
        ) from error

    timeout_seconds = _resolve_timeout(args)
    max_rows = _resolve_max_rows(args)
    started_at = time.monotonic()

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                _run_redis_command,
                args=args,
                timeout_seconds=timeout_seconds,
                max_rows=max_rows,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as error:
        raise RedisTimeoutError(
            source_id=source.id,
            step_id=step.id,
            code="runtime.redis_timeout",
            summary="Redis query timed out.",
            details=f"Query exceeded timeout limit of {timeout_seconds:.3f} second(s).",
        ) from error
    except Exception as error:
        raise _map_runtime_error(
            source_id=source.id,
            step_id=step.id,
            reason=error,
        ) from error

    rows = result.get("rows")
    fields = result.get("fields")
    command = str(result.get("command") or _normalize_command(args))
    truncated = bool(result.get("truncated"))
    if not isinstance(rows, list):
        rows = []
    if not isinstance(fields, list):
        fields = []

    response = {
        "rows": rows,
        "fields": fields,
        "row_count": len(rows),
        "duration_ms": int((time.monotonic() - started_at) * 1000),
        "truncated": truncated,
        "command": command,
        "timeout_seconds": timeout_seconds,
        "max_rows": max_rows,
    }
    _validate_response_contract(
        source_id=source.id,
        step_id=step.id,
        response=response,
    )
    return {"redis_response": response}
