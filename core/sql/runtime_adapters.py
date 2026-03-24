"""SQL runtime adapter helpers for connector profiles."""

from __future__ import annotations

import sqlite3
from collections.abc import Mapping, Sequence
from typing import Any


def _description_name(meta: Any) -> str:
    if hasattr(meta, "name"):
        return str(getattr(meta, "name"))
    if isinstance(meta, Sequence) and meta:
        return str(meta[0])
    return ""


def _description_type_code(meta: Any) -> Any:
    if hasattr(meta, "type_code"):
        return getattr(meta, "type_code")
    if isinstance(meta, Sequence) and len(meta) > 1:
        return meta[1]
    return None


def _fetch_rows(
    cursor: Any,
    *,
    max_rows: int,
) -> tuple[list[str], list[dict[str, Any]], bool]:
    description = getattr(cursor, "description", None)
    if not description:
        return [], [], False

    columns = [_description_name(meta) for meta in description]
    fetched_rows = cursor.fetchmany(max_rows + 1)
    has_more_rows = len(fetched_rows) > max_rows
    rows = [dict(zip(columns, row)) for row in fetched_rows[:max_rows]]
    return columns, rows, has_more_rows


def _resolve_sqlite_database_path(credentials: Mapping[str, Any]) -> str:
    for key in ("database", "path", "dsn"):
        raw_value = credentials.get(key)
        if not isinstance(raw_value, str):
            continue
        value = raw_value.strip()
        if not value:
            continue
        if key == "dsn" and value.startswith("sqlite:///"):
            return value[len("sqlite:///") :]
        return value
    raise ValueError("Missing SQL credential field: credentials.database")


def _build_sqlite_type_hints(cursor: sqlite3.Cursor) -> dict[str, str]:
    hints: dict[str, str] = {}
    for meta in cursor.description or []:
        column_name = _description_name(meta)
        type_code = _description_type_code(meta)
        if column_name and type_code is not None:
            hints[column_name] = str(type_code)
    return hints


def run_sqlite_query(
    *,
    credentials: Mapping[str, Any],
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    database_path = _resolve_sqlite_database_path(credentials)
    connection = sqlite3.connect(database_path)
    try:
        cursor = connection.execute(query_text)
        columns, rows, has_more_rows = _fetch_rows(cursor, max_rows=max_rows)
        db_type_hints = _build_sqlite_type_hints(cursor)
        connection.commit()
        return {
            "columns": columns,
            "rows": rows,
            "has_more_rows": has_more_rows,
            "db_type_hints": db_type_hints,
        }
    finally:
        connection.close()


def _resolve_postgresql_connect_args(credentials: Mapping[str, Any]) -> tuple[str | None, dict[str, Any]]:
    dsn_value = credentials.get("dsn")
    if isinstance(dsn_value, str):
        dsn = dsn_value.strip()
        if dsn:
            return dsn, {}

    connect_kwargs: dict[str, Any] = {}
    for key in ("host", "database", "user", "password", "sslmode"):
        value = credentials.get(key)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                connect_kwargs["dbname" if key == "database" else key] = stripped

    port_value = credentials.get("port", 5432)
    try:
        connect_kwargs["port"] = int(port_value)
    except (TypeError, ValueError):
        connect_kwargs["port"] = 5432

    return None, connect_kwargs


def _build_postgresql_type_hints(connection: Any, cursor: Any) -> dict[str, str]:
    hints: dict[str, str] = {}
    description = getattr(cursor, "description", None) or []
    type_registry = getattr(getattr(connection, "adapters", None), "types", None)

    for meta in description:
        column_name = _description_name(meta)
        type_code = _description_type_code(meta)
        if not column_name:
            continue

        db_type_hint: str | None = None
        if type_registry is not None and type_code is not None:
            try:
                type_info = type_registry.get(type_code)
            except Exception:  # pragma: no cover - defensive registry access
                type_info = None
            if type_info is not None:
                db_type_hint = getattr(type_info, "name", None)

        if db_type_hint is None and type_code is not None:
            db_type_hint = str(type_code)
        if db_type_hint:
            hints[column_name] = str(db_type_hint)
    return hints


def run_postgresql_query(
    *,
    credentials: Mapping[str, Any],
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    try:
        import psycopg
    except ImportError as error:  # pragma: no cover - dependency gate in runtime environments
        raise RuntimeError("psycopg dependency is required for postgresql profile") from error

    dsn, connect_kwargs = _resolve_postgresql_connect_args(credentials)
    if dsn is not None:
        connection = psycopg.connect(dsn)
    else:
        connection = psycopg.connect(**connect_kwargs)

    try:
        with connection.cursor() as cursor:
            cursor.execute(query_text)
            columns, rows, has_more_rows = _fetch_rows(cursor, max_rows=max_rows)
            db_type_hints = _build_postgresql_type_hints(connection, cursor)
        connection.commit()
        return {
            "columns": columns,
            "rows": rows,
            "has_more_rows": has_more_rows,
            "db_type_hints": db_type_hints,
        }
    finally:
        connection.close()


def run_sql_query_for_profile(
    profile: str,
    *,
    credentials: Mapping[str, Any],
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    normalized_profile = str(profile or "").strip().lower()
    if normalized_profile == "sqlite":
        return run_sqlite_query(
            credentials=credentials,
            query_text=query_text,
            max_rows=max_rows,
        )
    if normalized_profile == "postgresql":
        return run_postgresql_query(
            credentials=credentials,
            query_text=query_text,
            max_rows=max_rows,
        )
    raise ValueError(f"Unsupported SQL connector profile: {normalized_profile or 'unknown'}")
