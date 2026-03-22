from __future__ import annotations

import json
import sqlite3
import time
from threading import RLock
from typing import Any, Callable, TypeVar

from core.storage.errors import map_sqlite_error

_T = TypeVar("_T")


class SqliteRuntimeRepository:
    def __init__(self, connection: sqlite3.Connection):
        self._connection = connection
        self._lock = RLock()

    def _decode_record(self, payload_json: str) -> dict[str, Any] | None:
        try:
            payload = json.loads(payload_json)
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        return payload

    def _load_latest(self, source_id: str) -> dict[str, Any] | None:
        try:
            row = self._connection.execute(
                "SELECT payload_json FROM runtime_latest WHERE source_id = ?",
                (source_id,),
            ).fetchone()
        except sqlite3.Error as error:
            raise map_sqlite_error(error, kind="read", operation="runtime.load_latest") from error
        if row is None:
            return None
        return self._decode_record(row["payload_json"])

    def _write(self, operation: str, action: Callable[[], _T]) -> _T:
        try:
            self._connection.execute("BEGIN IMMEDIATE")
        except sqlite3.Error as error:
            raise map_sqlite_error(error, kind="write", operation=operation) from error

        try:
            result = action()
        except Exception as error:
            self._connection.rollback()
            if isinstance(error, sqlite3.Error):
                raise map_sqlite_error(error, kind="write", operation=operation) from error
            raise

        try:
            self._connection.commit()
        except sqlite3.Error as error:
            self._connection.rollback()
            raise map_sqlite_error(error, kind="write", operation=operation) from error
        return result

    def _save_latest(
        self,
        source_id: str,
        record: dict[str, Any],
        *,
        updated_at: float,
        last_success_at: float | None,
    ) -> None:
        payload_json = json.dumps(record, ensure_ascii=False)
        self._write(
            "runtime.save_latest",
            lambda: self._connection.execute(
                """
                INSERT INTO runtime_latest(source_id, payload_json, updated_at, last_success_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(source_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at,
                    last_success_at = excluded.last_success_at
                """,
                (source_id, payload_json, updated_at, last_success_at),
            ),
        )

    def upsert_migration_latest(self, records: list[dict[str, Any]]) -> list[str]:
        if not records:
            return []

        with self._lock:
            migrated_source_ids: list[str] = []
            seen: set[str] = set()

            def _upsert_batch() -> list[str]:
                for record in records:
                    source_id = str(record.get("source_id", "")).strip()
                    if not source_id:
                        continue
                    payload_json = json.dumps(record, ensure_ascii=False)
                    raw_updated_at = record.get("updated_at")
                    updated_at = (
                        float(raw_updated_at)
                        if isinstance(raw_updated_at, (int, float))
                        else time.time()
                    )
                    raw_last_success_at = record.get("last_success_at")
                    last_success_at = (
                        float(raw_last_success_at)
                        if isinstance(raw_last_success_at, (int, float))
                        else None
                    )
                    self._connection.execute(
                        """
                        INSERT INTO runtime_latest(source_id, payload_json, updated_at, last_success_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(source_id) DO UPDATE SET
                            payload_json = excluded.payload_json,
                            updated_at = excluded.updated_at,
                            last_success_at = excluded.last_success_at
                        """,
                        (source_id, payload_json, updated_at, last_success_at),
                    )
                    if source_id not in seen:
                        seen.add(source_id)
                        migrated_source_ids.append(source_id)
                return migrated_source_ids

            return self._write("runtime.upsert_migration_latest", _upsert_batch)

    def upsert(self, source_id: str, data: dict[str, Any]) -> None:
        now = time.time()
        record = {
            "source_id": source_id,
            "data": data,
            "updated_at": now,
            "last_success_at": now,
        }
        with self._lock:
            self._save_latest(source_id, record, updated_at=now, last_success_at=now)

    def set_error(self, source_id: str, error: str) -> None:
        now = time.time()
        record = {
            "source_id": source_id,
            "data": None,
            "error": error,
            "updated_at": now,
        }
        with self._lock:
            self._save_latest(source_id, record, updated_at=now, last_success_at=None)

    def set_state(
        self,
        source_id: str,
        status: str,
        message: str | None = None,
        interaction: dict[str, Any] | None = None,
        error: str | None = None,
        error_code: str | None = None,
    ) -> None:
        now = time.time()
        with self._lock:
            existing = self._load_latest(source_id) or {"source_id": source_id}
            record = dict(existing)
            record.update(
                {
                    "source_id": source_id,
                    "status": status,
                    "message": message,
                    "interaction": interaction,
                    "updated_at": now,
                }
            )
            if error is not None:
                record["error"] = error
            elif status != "error":
                record.pop("error", None)
            if error_code is not None:
                record["error_code"] = error_code
            elif status not in {"error", "suspended"}:
                record.pop("error_code", None)
            last_success_at = (
                float(record["last_success_at"])
                if isinstance(record.get("last_success_at"), (int, float))
                else None
            )
            self._save_latest(
                source_id,
                record,
                updated_at=now,
                last_success_at=last_success_at,
            )

    def set_retry_metadata(self, source_id: str, metadata: dict[str, Any] | None) -> None:
        with self._lock:
            existing = self._load_latest(source_id)
            if not isinstance(existing, dict):
                return
            record = dict(existing)
            if metadata is None:
                record.pop("retry_metadata", None)
            else:
                record["retry_metadata"] = dict(metadata)
            updated_at = (
                float(record["updated_at"])
                if isinstance(record.get("updated_at"), (int, float))
                else time.time()
            )
            last_success_at = (
                float(record["last_success_at"])
                if isinstance(record.get("last_success_at"), (int, float))
                else None
            )
            self._save_latest(
                source_id,
                record,
                updated_at=updated_at,
                last_success_at=last_success_at,
            )

    def clear_retry_metadata(self, source_id: str) -> None:
        self.set_retry_metadata(source_id, None)

    def get_latest(self, source_id: str) -> dict[str, Any] | None:
        with self._lock:
            latest = self._load_latest(source_id)
            return dict(latest) if isinstance(latest, dict) else None

    def get_all_latest(self) -> list[dict[str, Any]]:
        with self._lock:
            try:
                rows = self._connection.execute(
                    "SELECT payload_json FROM runtime_latest ORDER BY source_id"
                ).fetchall()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="runtime.get_all_latest",
                ) from error
        records: list[dict[str, Any]] = []
        for row in rows:
            record = self._decode_record(row["payload_json"])
            if isinstance(record, dict):
                records.append(dict(record))
        return records

    def get_history(self, source_id: str, limit: int = 100) -> list[dict[str, Any]]:
        safe_limit = 0 if limit < 0 else limit
        with self._lock:
            try:
                rows = self._connection.execute(
                    """
                    SELECT timestamp, payload_json
                    FROM runtime_history
                    WHERE source_id = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                    """,
                    (source_id, safe_limit),
                ).fetchall()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="runtime.get_history",
                ) from error
        records: list[dict[str, Any]] = []
        for row in rows:
            payload = self._decode_record(row["payload_json"])
            if not isinstance(payload, dict):
                continue
            payload.setdefault("source_id", source_id)
            payload.setdefault("timestamp", row["timestamp"])
            records.append(payload)
        return records

    def clear_source(self, source_id: str) -> None:
        with self._lock:
            self._write(
                "runtime.clear_source",
                lambda: (
                    self._connection.execute(
                        "DELETE FROM runtime_latest WHERE source_id = ?",
                        (source_id,),
                    ),
                    self._connection.execute(
                        "DELETE FROM runtime_history WHERE source_id = ?",
                        (source_id,),
                    ),
                ),
            )
