"""SQL runtime adapter helpers for connector profiles."""

from __future__ import annotations

import sqlite3
from collections.abc import Sequence
from typing import Any
from urllib.parse import parse_qsl, unquote, urlparse


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


def _resolve_sqlite_database_path(dsn: str) -> str:
    value = str(dsn or "").strip()
    if not value:
        raise ValueError("Missing SQL connection string: args.dsn/args.uri")
    if value.startswith("sqlite:///"):
        return value[len("sqlite:///") :]
    return value


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
    dsn: str,
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    database_path = _resolve_sqlite_database_path(dsn)
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


def _resolve_postgresql_dsn(dsn: str) -> str:
    value = str(dsn or "").strip()
    if not value:
        raise ValueError("Missing SQL connection string: args.dsn/args.uri")
    return value


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
    dsn: str,
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    try:
        import psycopg
    except ImportError as error:  # pragma: no cover - dependency gate in runtime environments
        raise RuntimeError("psycopg dependency is required for postgresql profile") from error

    connection = psycopg.connect(_resolve_postgresql_dsn(dsn))

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


def _parse_mysql_dsn(dsn: str) -> dict[str, Any]:
    parsed = urlparse(dsn)
    if parsed.scheme not in {"mysql", "mysql+pymysql"}:
        raise ValueError("Invalid MySQL DSN scheme. Expected mysql://")

    connect_kwargs: dict[str, Any] = {}
    if parsed.hostname:
        connect_kwargs["host"] = parsed.hostname
    if parsed.port is not None:
        connect_kwargs["port"] = int(parsed.port)
    if parsed.username:
        connect_kwargs["user"] = unquote(parsed.username)
    if parsed.password:
        connect_kwargs["password"] = unquote(parsed.password)
    if parsed.path and parsed.path != "/":
        connect_kwargs["database"] = unquote(parsed.path.lstrip("/"))

    for key, value in parse_qsl(parsed.query, keep_blank_values=False):
        if key == "port":
            try:
                connect_kwargs["port"] = int(value)
            except (TypeError, ValueError):
                continue
            continue
        if key in {"charset", "ssl_ca", "ssl_cert", "ssl_key"} and value:
            connect_kwargs[key] = value
    return connect_kwargs


def _resolve_mysql_connect_args(dsn: str) -> dict[str, Any]:
    value = str(dsn or "").strip()
    if not value:
        raise ValueError("Missing SQL connection string: args.dsn/args.uri")

    connect_kwargs = _parse_mysql_dsn(value)
    if "database" not in connect_kwargs:
        raise ValueError("Missing SQL database segment in MySQL DSN.")
    if "user" not in connect_kwargs:
        raise ValueError("Missing SQL user segment in MySQL DSN.")
    return connect_kwargs


def _build_mysql_type_hints(cursor: Any) -> dict[str, str]:
    hints: dict[str, str] = {}
    field_type_by_code: dict[int, str] = {}
    try:
        from pymysql.constants import FIELD_TYPE

        field_type_by_code = {
            int(value): str(name).lower()
            for name, value in vars(FIELD_TYPE).items()
            if name.isupper() and isinstance(value, int)
        }
    except Exception:  # pragma: no cover - fallback when driver constants are unavailable
        field_type_by_code = {}

    for meta in cursor.description or []:
        column_name = _description_name(meta)
        type_code = _description_type_code(meta)
        if not column_name:
            continue
        if isinstance(type_code, int) and type_code in field_type_by_code:
            hints[column_name] = field_type_by_code[type_code]
            continue
        if type_code is not None:
            hints[column_name] = str(type_code)
    return hints


def run_mysql_query(
    *,
    dsn: str,
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    try:
        import pymysql
    except ImportError as error:  # pragma: no cover - dependency gate in runtime environments
        raise RuntimeError("pymysql dependency is required for mysql profile") from error

    connect_kwargs = _resolve_mysql_connect_args(dsn)
    connection = pymysql.connect(**connect_kwargs)
    try:
        with connection.cursor() as cursor:
            cursor.execute(query_text)
            columns, rows, has_more_rows = _fetch_rows(cursor, max_rows=max_rows)
            db_type_hints = _build_mysql_type_hints(cursor)
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
    dsn: str,
    query_text: str,
    max_rows: int,
) -> dict[str, Any]:
    normalized_profile = str(profile or "").strip().lower()
    if normalized_profile == "sqlite":
        return run_sqlite_query(
            dsn=dsn,
            query_text=query_text,
            max_rows=max_rows,
        )
    if normalized_profile == "postgresql":
        return run_postgresql_query(
            dsn=dsn,
            query_text=query_text,
            max_rows=max_rows,
        )
    if normalized_profile == "mysql":
        return run_mysql_query(
            dsn=dsn,
            query_text=query_text,
            max_rows=max_rows,
        )
    raise ValueError(f"Unsupported SQL connector profile: {normalized_profile or 'unknown'}")
