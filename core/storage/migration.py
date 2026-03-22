from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from core.models import StoredSource, StoredView
from core.storage.contract import StorageContract
from core.storage.errors import (
    StorageContractError,
    StorageReadError,
    StorageSchemaMismatchError,
    StorageWriteError,
    map_sqlite_error,
)
from core.storage.sqlite_resource_repo import SqliteResourceRepository
from core.storage.sqlite_runtime_repo import SqliteRuntimeRepository

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


def _resolve_sqlite_context(
    storage: StorageContract,
) -> tuple[SqliteRuntimeRepository, SqliteResourceRepository, sqlite3.Connection]:
    runtime_repo = storage.runtime
    resource_repo = storage.resources
    if not isinstance(runtime_repo, SqliteRuntimeRepository):
        raise StorageSchemaMismatchError("startup migration requires sqlite runtime repository")
    if not isinstance(resource_repo, SqliteResourceRepository):
        raise StorageSchemaMismatchError("startup migration requires sqlite resource repository")

    runtime_conn = getattr(runtime_repo, "_connection", None)
    resource_conn = getattr(resource_repo, "_connection", None)
    if not isinstance(runtime_conn, sqlite3.Connection):
        raise StorageSchemaMismatchError("startup migration requires sqlite runtime repository")
    if not isinstance(resource_conn, sqlite3.Connection):
        raise StorageSchemaMismatchError("startup migration requires sqlite resource repository")
    if runtime_conn is not resource_conn:
        raise StorageSchemaMismatchError("startup migration requires shared sqlite connection")
    return runtime_repo, resource_repo, runtime_conn


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


def _migrate_data_chunk(
    path: Path,
    connection: sqlite3.Connection,
    runtime_repo: SqliteRuntimeRepository,
) -> None:
    entries = _normalize_entries(_load_json_payload(path), chunk_name=path.name)
    normalized_records: list[dict[str, Any]] = []
    for entry in entries:
        source_id_raw = entry.get("source_id")
        if not isinstance(source_id_raw, str) or not source_id_raw.strip():
            raise StorageWriteError(f"startup migration missing source_id in {path.name}")
        payload = dict(entry)
        payload["source_id"] = source_id_raw.strip()
        payload.setdefault("data", None)

        now = time.time()
        updated_at_raw = payload.get("updated_at")
        updated_at = float(updated_at_raw) if isinstance(updated_at_raw, (int, float)) else now
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
        normalized_records.append(payload)

    source_ids = runtime_repo.upsert_migration_latest(normalized_records)
    _validate_runtime_rows(connection, source_ids)


def _migrate_sources_chunk(
    path: Path,
    connection: sqlite3.Connection,
    resource_repo: SqliteResourceRepository,
) -> None:
    entries = _normalize_entries(_load_json_payload(path), chunk_name=path.name)
    sources: list[StoredSource] = []
    for entry in entries:
        try:
            sources.append(StoredSource.model_validate(entry))
        except Exception as error:
            raise StorageWriteError(f"startup migration invalid sources.json record: {error}") from error
    source_ids = resource_repo.upsert_migration_sources(sources)
    _validate_source_rows(connection, source_ids)


def _migrate_views_chunk(
    path: Path,
    connection: sqlite3.Connection,
    resource_repo: SqliteResourceRepository,
) -> None:
    entries = _normalize_entries(_load_json_payload(path), chunk_name=path.name)
    views: list[StoredView] = []
    for entry in entries:
        try:
            views.append(StoredView.model_validate(entry))
        except Exception as error:
            raise StorageWriteError(f"startup migration invalid views.json record: {error}") from error
    view_ids = resource_repo.upsert_migration_views(views)
    _validate_view_rows(connection, view_ids)


def _rename_to_deprecated(path: Path) -> None:
    target = _deprecated_path(path)
    try:
        os.replace(path, target)
    except OSError as error:
        raise StorageWriteError(
            f"startup migration failed to mark {path.name} as deprecated: {error}"
        ) from error


def _migrate_chunk(
    path: Path,
    *,
    connection: sqlite3.Connection,
    runtime_repo: SqliteRuntimeRepository,
    resource_repo: SqliteResourceRepository,
) -> None:
    if path.name == "data.json":
        _migrate_data_chunk(path, connection, runtime_repo)
    elif path.name == "sources.json":
        _migrate_sources_chunk(path, connection, resource_repo)
    elif path.name == "views.json":
        _migrate_views_chunk(path, connection, resource_repo)
    else:
        raise StorageSchemaMismatchError(f"unsupported startup migration chunk: {path.name}")
    _rename_to_deprecated(path)


def run_startup_migration(storage: StorageContract, *, data_dir: str | Path | None = None) -> None:
    resolved_dir = _resolve_data_dir(data_dir)
    resolved_dir.mkdir(parents=True, exist_ok=True)
    runtime_repo, resource_repo, connection = _resolve_sqlite_context(storage)

    for chunk_name in _CHUNK_ORDER:
        chunk_path = resolved_dir / chunk_name
        deprecated_path = _deprecated_path(chunk_path)
        if deprecated_path.exists():
            continue
        if not chunk_path.exists():
            continue
        _migrate_chunk(
            chunk_path,
            connection=connection,
            runtime_repo=runtime_repo,
            resource_repo=resource_repo,
        )
