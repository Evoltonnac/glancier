"""Canonical SQL response normalization helpers."""

from __future__ import annotations

import base64
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Mapping, Sequence


_CANONICAL_FIELD_TYPES = {
    "integer",
    "float",
    "decimal",
    "string",
    "boolean",
    "date",
    "time",
    "datetime",
    "bytes",
    "unknown",
}

_DB_TYPE_HINT_MAP: dict[str, str] = {
    "bool": "boolean",
    "boolean": "boolean",
    "tinyint": "integer",
    "smallint": "integer",
    "int": "integer",
    "integer": "integer",
    "bigint": "integer",
    "real": "float",
    "float": "float",
    "double": "float",
    "double precision": "float",
    "numeric": "decimal",
    "decimal": "decimal",
    "char": "string",
    "varchar": "string",
    "text": "string",
    "uuid": "string",
    "json": "string",
    "jsonb": "string",
    "tiny": "integer",
    "short": "integer",
    "long": "integer",
    "longlong": "integer",
    "int24": "integer",
    "year": "integer",
    "newdecimal": "decimal",
    "var_string": "string",
    "enum": "string",
    "set": "string",
    "date": "date",
    "time": "time",
    "timestamp": "datetime",
    "timetz": "time",
    "datetime": "datetime",
    "timestamptz": "datetime",
    "blob": "bytes",
    "tiny_blob": "bytes",
    "medium_blob": "bytes",
    "long_blob": "bytes",
    "bytea": "bytes",
    "binary": "bytes",
    "varbinary": "bytes",
}


def serialize_sql_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is not None and value.utcoffset() is not None:
            return value.astimezone(timezone.utc).isoformat()
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(value)).decode("ascii")
    return str(value)


def infer_field_type(value: Any) -> str:
    if value is None:
        return "unknown"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "float"
    if isinstance(value, Decimal):
        return "decimal"
    if isinstance(value, datetime):
        return "datetime"
    if isinstance(value, date):
        return "date"
    if isinstance(value, time):
        return "time"
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "bytes"
    if isinstance(value, str):
        return "string"
    return "unknown"


def _normalize_type_hint(raw_type: str | None) -> str | None:
    if not raw_type:
        return None
    normalized = raw_type.strip().lower()
    if not normalized:
        return None
    if normalized in _CANONICAL_FIELD_TYPES:
        return normalized
    return _DB_TYPE_HINT_MAP.get(normalized, "unknown")


def build_sql_fields(
    columns: Sequence[str],
    rows: Sequence[Mapping[str, Any]],
    *,
    db_type_hints: Mapping[str, str] | None = None,
) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    type_hints = db_type_hints or {}
    for column in columns:
        hinted = _normalize_type_hint(type_hints.get(column))
        if hinted is not None:
            fields.append({"name": column, "type": hinted})
            continue

        inferred_type = "unknown"
        for row in rows:
            if column not in row:
                continue
            value = row[column]
            if value is None:
                continue
            inferred_type = infer_field_type(value)
            break
        fields.append({"name": column, "type": inferred_type})
    return fields


def build_normalized_sql_response(
    *,
    rows: Sequence[Mapping[str, Any]],
    fields: Sequence[Mapping[str, Any]],
    row_count: int,
    duration_ms: int,
    truncated: bool,
    statement_count: int,
    statement_types: Sequence[str],
    is_high_risk: bool,
    risk_reasons: Sequence[str],
    timeout_seconds: float,
    max_rows: int,
) -> dict[str, Any]:
    serialized_rows = [
        {column: serialize_sql_value(value) for column, value in row.items()} for row in rows
    ]
    normalized_fields = [dict(field) for field in fields]
    columns = [str(field.get("name", "")) for field in normalized_fields]

    return {
        "rows": serialized_rows,
        "fields": normalized_fields,
        "row_count": row_count,
        "duration_ms": duration_ms,
        "truncated": truncated,
        "statement_count": statement_count,
        "statement_types": list(statement_types),
        "is_high_risk": is_high_risk,
        "risk_reasons": list(risk_reasons),
        "timeout_seconds": timeout_seconds,
        "max_rows": max_rows,
        "columns": columns,
        "execution_ms": duration_ms,
    }
