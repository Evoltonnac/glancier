"""MongoDB step runtime execution."""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

from core.log_redaction import sanitize_log_reason
from core.sql.normalization import build_sql_fields, serialize_sql_value
from core.steps.db_trust import enforce_database_network_trust

if TYPE_CHECKING:
    from core.config_loader import SourceConfig, StepConfig


_DEFAULT_TIMEOUT_SECONDS = 30.0
_DEFAULT_MAX_ROWS = 500
_MIN_TIMEOUT_SECONDS = 0.1
_MIN_MAX_ROWS = 1
_ALLOWED_OPERATIONS = {"find", "aggregate"}
_SUPPORTED_PROFILE = "mongodb"
_REQUIRED_RESPONSE_KEYS = (
    "rows",
    "fields",
    "row_count",
    "duration_ms",
    "truncated",
    "operation",
    "timeout_seconds",
    "max_rows",
)


class MongoStepRuntimeError(RuntimeError):
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


class MongoInvalidContractError(MongoStepRuntimeError):
    pass


class MongoConnectFailedError(MongoStepRuntimeError):
    pass


class MongoAuthFailedError(MongoStepRuntimeError):
    pass


class MongoQueryFailedError(MongoStepRuntimeError):
    pass


class MongoTimeoutError(MongoStepRuntimeError):
    pass


def _normalize_operation(args: dict[str, Any]) -> str:
    raw = args.get("operation", "find")
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
    raise ValueError("MongoDB connection string is required (args.uri or args.dsn).")


def _serialize_document(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _serialize_document(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize_document(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_document(item) for item in value]
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
            "authentication failed",
            "auth failed",
            "not authorized",
            "requires authentication",
            "bad auth",
        )
    )


def _is_connect_failure(message: str) -> bool:
    lowered = message.lower()
    return any(
        token in lowered
        for token in (
            "serverselectiontimeouterror",
            "connection refused",
            "name or service not known",
            "nodename nor servname provided",
            "network is unreachable",
            "timed out",
            "dependency is required",
        )
    )


def _resolve_projection(projection: Any) -> dict[str, int] | dict[str, Any] | None:
    if projection is None:
        return None
    if isinstance(projection, list) and all(isinstance(field, str) for field in projection):
        return {field: 1 for field in projection}
    if isinstance(projection, dict):
        return projection
    raise ValueError("MongoDB projection must be an object or array of field names.")


def _resolve_sort(sort_value: Any) -> list[tuple[str, int]] | None:
    if sort_value is None:
        return None
    if not isinstance(sort_value, dict):
        raise ValueError("MongoDB sort must be an object map of field -> direction.")

    resolved: list[tuple[str, int]] = []
    for key, value in sort_value.items():
        if not isinstance(key, str) or not key.strip():
            continue
        direction = 1
        if isinstance(value, (int, float)):
            direction = -1 if int(value) < 0 else 1
        elif isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"-1", "desc", "descending"}:
                direction = -1
            else:
                direction = 1
        resolved.append((key, direction))
    return resolved or None


def _run_mongodb_query(
    *,
    args: dict[str, Any],
    timeout_seconds: float,
    max_rows: int,
) -> dict[str, Any]:
    try:
        import pymongo
    except ImportError as error:  # pragma: no cover - dependency gate in runtime environments
        raise RuntimeError("pymongo dependency is required for mongodb step") from error

    uri = _resolve_connection_string(args)

    database = str(args.get("database") or "").strip()
    collection = str(args.get("collection") or "").strip()
    operation = _normalize_operation(args)
    if not database or not collection:
        raise ValueError("MongoDB database and collection are required.")
    if operation not in _ALLOWED_OPERATIONS:
        raise ValueError(f"Unsupported MongoDB operation: {operation or 'unknown'}")

    timeout_ms = int(timeout_seconds * 1000)
    client = pymongo.MongoClient(
        uri,
        serverSelectionTimeoutMS=timeout_ms,
        connectTimeoutMS=timeout_ms,
        socketTimeoutMS=timeout_ms,
    )
    try:
        target_collection = client[database][collection]
        if operation == "find":
            filter_query = args.get("filter", {})
            if filter_query is None:
                filter_query = {}
            if not isinstance(filter_query, dict):
                raise ValueError("MongoDB filter must be an object for operation=find.")
            projection = _resolve_projection(args.get("projection"))
            cursor = target_collection.find(filter_query, projection)
            sort_pairs = _resolve_sort(args.get("sort"))
            if sort_pairs:
                cursor = cursor.sort(sort_pairs)
            docs = list(cursor.limit(max_rows + 1))
        else:
            pipeline = args.get("pipeline")
            if not isinstance(pipeline, list) or not all(isinstance(item, dict) for item in pipeline):
                raise ValueError("MongoDB pipeline must be a list of stage objects for operation=aggregate.")
            effective_pipeline = list(pipeline)
            effective_pipeline.append({"$limit": max_rows + 1})
            docs = list(target_collection.aggregate(effective_pipeline))
    finally:
        client.close()

    has_more = len(docs) > max_rows
    normalized_rows = [_serialize_document(doc) for doc in docs[:max_rows]]
    if not isinstance(normalized_rows, list):
        normalized_rows = []

    columns = _columns_from_rows(normalized_rows)
    fields = build_sql_fields(columns, normalized_rows, db_type_hints={})
    return {
        "rows": normalized_rows,
        "fields": fields,
        "truncated": has_more,
        "operation": operation,
    }


def _validate_contract(args: dict[str, Any]) -> None:
    profile = _normalize_profile(args)
    if profile is not None and profile != _SUPPORTED_PROFILE:
        raise ValueError(f"Unsupported MongoDB connector profile: {profile}")

    operation = _normalize_operation(args)
    if operation not in _ALLOWED_OPERATIONS:
        raise ValueError(
            "MongoDB operation is required and must be one of: find, aggregate."
        )

    _resolve_connection_string(args)
    if not isinstance(args.get("database"), str) or not str(args.get("database")).strip():
        raise ValueError("MongoDB database is required.")
    if not isinstance(args.get("collection"), str) or not str(args.get("collection")).strip():
        raise ValueError("MongoDB collection is required.")


def _map_runtime_error(
    *,
    source_id: str,
    step_id: str,
    reason: Exception,
) -> MongoStepRuntimeError:
    reason_text = sanitize_log_reason(reason)
    if _is_auth_failure(reason_text):
        return MongoAuthFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.mongo_auth_failed",
            summary="MongoDB authentication failed.",
            details=reason_text,
        )
    if _is_connect_failure(reason_text):
        return MongoConnectFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.mongo_connect_failed",
            summary="MongoDB connection failed.",
            details=reason_text,
        )
    return MongoQueryFailedError(
        source_id=source_id,
        step_id=step_id,
        code="runtime.mongo_query_failed",
        summary="MongoDB query execution failed.",
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
        raise MongoQueryFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.mongo_query_failed",
            summary="MongoDB query execution failed.",
            details=f"MongoDB response missing keys: {', '.join(sorted(missing))}",
        )


async def execute_mongodb_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: dict[str, Any],
    context: dict[str, Any],
    outputs: dict[str, Any],
    executor: Any,
) -> dict[str, Any]:
    _ = (context, outputs)
    profile = _normalize_profile(args) or _SUPPORTED_PROFILE
    connection_string = str(args.get("uri") or args.get("dsn") or "")
    enforce_database_network_trust(
        capability="mongodb",
        profile=profile,
        connection_string=connection_string,
        source=source,
        step=step,
        executor=executor,
    )
    try:
        _validate_contract(args)
    except Exception as error:
        raise MongoInvalidContractError(
            source_id=source.id,
            step_id=step.id,
            code="runtime.mongo_invalid_contract",
            summary="MongoDB step contract is invalid.",
            details=sanitize_log_reason(error),
        ) from error

    timeout_seconds = _resolve_timeout(args)
    max_rows = _resolve_max_rows(args)
    started_at = time.monotonic()

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                _run_mongodb_query,
                args=args,
                timeout_seconds=timeout_seconds,
                max_rows=max_rows,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as error:
        raise MongoTimeoutError(
            source_id=source.id,
            step_id=step.id,
            code="runtime.mongo_timeout",
            summary="MongoDB query timed out.",
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
    truncated = bool(result.get("truncated"))
    operation = str(result.get("operation") or _normalize_operation(args))
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
        "operation": operation,
        "timeout_seconds": timeout_seconds,
        "max_rows": max_rows,
    }
    _validate_response_contract(
        source_id=source.id,
        step_id=step.id,
        response=response,
    )
    return {"mongo_response": response}
