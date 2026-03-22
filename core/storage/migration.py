from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Iterable

from core.models import StoredSource, StoredView
from core.storage.contract import StorageContract
from core.storage.errors import (
    StorageContractError,
    StorageReadError,
    StorageSchemaMismatchError,
    StorageWriteError,
    map_sqlite_error,
)
from core.storage.sqlite_connection import execute_write_transaction

_DEPRECATED_SUFFIX = ".deprecated.v1.json"
_CHUNK_ORDER = ("data.json", "sources.json", "views.json")


def _resolve_data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    return Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data"


def _deprecated_path(path: Path) -> Path:
    return path.with_name(f"{path.stem}.deprecated.v1{path.suffix}")


def _load_json_payload(path: Path) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
        return json.loads(text)
    except FileNotFoundError:
        raise
    except json.JSONDecodeError as error:
        raise StorageReadError(f"startup migration failed to parse {path.name}: {error}") from error
    except OSError as error:
        raise StorageReadError(f"startup migration failed to read {path.name}: {error}") from error


def _normalize_entries(payload: Any, *, chunk_name: str) -> list[dict[str, Any]]:
    if payload is None:
        return []

    if isinstance(payload, list):
        entries = payload
    elif isinstance(payload, dict):
        default_section = payload.get("_default")
        if isinstance(default_section, dict):
            entries = list(default_section.values())
        elif "source_id" in payload or "id" in payload:
            entries = [payload]
        else:
            entries = []
            for key, value in payload.items():
                if not isinstance(value, dict):
                    raise StorageWriteError(
                        f"startup migration invalid {chunk_name} record for key '{key}'"
                    )
                entry = dict(value)
                entry.setdefault("source_id", str(key))
                entry.setdefault("id", str(key))
                entries.append(entry)
    else:
        raise StorageWriteError(f"startup migration expected list/dict in {chunk_name}")

    normalized: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise StorageWriteError(f"startup migration invalid {chunk_name} record shape")
        normalized.append(dict(entry))
    return normalized


def _resolve_sqlite_connection(storage: StorageContract) -> sqlite3.Connection:
    runtime_conn = getattr(storage.runtime, "_connection", None)
    resource_conn = getattr(storage.resources, "_connection", None)
    if not isinstance(runtime_conn, sqlite3.Connection):
        raise StorageSchemaMismatchError("startup migration requires sqlite runtime repository")
    if not isinstance(resource_conn, sqlite3.Connection):
        raise StorageSchemaMismatchError("startup migration requires sqlite resource repository")
    if runtime_conn is not resource_conn:
        raise StorageSchemaMismatchError("startup migration requires shared sqlite connection")
    return runtime_conn


def _to_source_ids(records: Iterable[dict[str, Any]], *, chunk_name: str) -> list[str]:
    ids: list[str] = []
    for record in records:
        raw_id = record.get("source_id")
        if not isinstance(raw_id, str) or not raw_id.strip():
            raise StorageWriteError(f"startup migration missing source_id in {chunk_name}")
        ids.append(raw_id.strip())
    return sorted(set(ids))


def _validate_runtime_rows(connection: sqlite3.Connection, source_ids: list[str]) -> None:
    if not source_ids:
        return
    placeholders = ",".join("?" for _ in source_ids)
    try:
        row = connection.execute(
            f"SELECT COUNT(*) AS count FROM runtime_latest WHERE source_id IN ({placeholders})",
            tuple(source_ids),
        ).fetchone()
    except sqlite3.Error as error:
        raise map_sqlite_error(error, kind="read", operation="migration.validate_runtime") from error
    count = int(row["count"]) if row is not None else 0
    if count != len(source_ids):
        raise StorageWriteError("startup migration validation failed for data.json chunk")


def _validate_source_rows(connection: sqlite3.Connection, source_ids: list[str]) -> None:
    if not source_ids:
        return
    placeholders = ",".join("?" for _ in source_ids)
    try:
        row = connection.execute(
            f"SELECT COUNT(*) AS count FROM stored_sources WHERE source_id IN ({placeholders})",
            tuple(source_ids),
        ).fetchone()
    except sqlite3.Error as error:
        raise map_sqlite_error(error, kind="read", operation="migration.validate_sources") from error
    count = int(row["count"]) if row is not None else 0
    if count != len(source_ids):
        raise StorageWriteError("startup migration validation failed for sources.json chunk")


def _validate_view_rows(connection: sqlite3.Connection, view_ids: list[str]) -> None:
    if not view_ids:
        return
    placeholders = ",".join("?" for _ in view_ids)
    try:
        row = connection.execute(
            f"SELECT COUNT(*) AS count FROM stored_views WHERE view_id IN ({placeholders})",
            tuple(view_ids),
        ).fetchone()
    except sqlite3.Error as error:
        raise map_sqlite_error(error, kind="read", operation="migration.validate_views") from error
    count = int(row["count"]) if row is not None else 0
    if count != len(view_ids):
        raise StorageWriteError("startup migration validation failed for views.json chunk")


def _migrate_data_chunk(path: Path, connection: sqlite3.Connection) -> None:
    entries = _normalize_entries(_load_json_payload(path), chunk_name=path.name)
    source_ids = _to_source_ids(entries, chunk_name=path.name)

    def _apply() -> None:
        for entry in entries:
            source_id = entry["source_id"].strip()
            payload = dict(entry)
            payload.setdefault("data", None)

            now = time.time()
            updated_at_raw = payload.get("updated_at")
            updated_at = (
                float(updated_at_raw)
                if isinstance(updated_at_raw, (int, float))
                else now
            )
            payload["updated_at"] = updated_at
            last_success_raw = payload.get("last_success_at")
            last_success_at = (
                float(last_success_raw)
                if isinstance(last_success_raw, (int, float))
                else (updated_at if payload.get("data") is not None else None)
            )
            if last_success_at is None:
                payload.pop("last_success_at", None)
            else:
                payload["last_success_at"] = last_success_at

            connection.execute(
                """
                INSERT INTO runtime_latest(source_id, payload_json, updated_at, last_success_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(source_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at,
                    last_success_at = excluded.last_success_at
                """,
                (
                    source_id,
                    json.dumps(payload, ensure_ascii=False),
                    updated_at,
                    last_success_at,
                ),
            )

        _validate_runtime_rows(connection, source_ids)

    execute_write_transaction(
        connection,
        operation="migration.data_chunk",
        action=_apply,
    )


def _migrate_sources_chunk(path: Path, connection: sqlite3.Connection) -> None:
    entries = _normalize_entries(_load_json_payload(path), chunk_name=path.name)
    sources: list[StoredSource] = []
    for entry in entries:
        try:
            sources.append(StoredSource.model_validate(entry))
        except Exception as error:
            raise StorageWriteError(f"startup migration invalid sources.json record: {error}") from error
    source_ids = sorted({source.id for source in sources})

    def _apply() -> None:
        now = time.time()
        for source in sources:
            connection.execute(
                """
                INSERT INTO stored_sources(source_id, payload_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(source_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    source.id,
                    json.dumps(source.model_dump(), ensure_ascii=False),
                    now,
                ),
            )
        _validate_source_rows(connection, source_ids)

    execute_write_transaction(
        connection,
        operation="migration.sources_chunk",
        action=_apply,
    )


def _migrate_views_chunk(path: Path, connection: sqlite3.Connection) -> None:
    entries = _normalize_entries(_load_json_payload(path), chunk_name=path.name)
    views: list[StoredView] = []
    for entry in entries:
        try:
            views.append(StoredView.model_validate(entry))
        except Exception as error:
            raise StorageWriteError(f"startup migration invalid views.json record: {error}") from error
    view_ids = sorted({view.id for view in views})

    def _apply() -> None:
        now = time.time()
        for view in views:
            connection.execute(
                """
                INSERT INTO stored_views(view_id, payload_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(view_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    view.id,
                    json.dumps(view.model_dump(), ensure_ascii=False),
                    now,
                ),
            )
        _validate_view_rows(connection, view_ids)

    execute_write_transaction(
        connection,
        operation="migration.views_chunk",
        action=_apply,
    )


def _rename_to_deprecated(path: Path) -> None:
    target = _deprecated_path(path)
    try:
        os.replace(path, target)
    except OSError as error:
        raise StorageWriteError(
            f"startup migration failed to mark {path.name} as deprecated: {error}"
        ) from error


def _migrate_chunk(path: Path, connection: sqlite3.Connection) -> None:
    handler_map = {
        "data.json": _migrate_data_chunk,
        "sources.json": _migrate_sources_chunk,
        "views.json": _migrate_views_chunk,
    }
    handler = handler_map.get(path.name)
    if handler is None:
        raise StorageSchemaMismatchError(f"unsupported startup migration chunk: {path.name}")
    handler(path, connection)
    _rename_to_deprecated(path)


def run_startup_migration(storage: StorageContract, *, data_dir: str | Path | None = None) -> None:
    resolved_dir = _resolve_data_dir(data_dir)
    resolved_dir.mkdir(parents=True, exist_ok=True)
    connection = _resolve_sqlite_connection(storage)

    for chunk_name in _CHUNK_ORDER:
        chunk_path = resolved_dir / chunk_name
        deprecated_path = _deprecated_path(chunk_path)
        if deprecated_path.exists():
            continue
        if not chunk_path.exists():
            continue
        _migrate_chunk(chunk_path, connection)
