from __future__ import annotations

import json
import sqlite3
import time
from threading import RLock
from typing import Callable, TypeVar

from core.models import StoredSource, StoredView
from core.storage.errors import map_sqlite_error

_T = TypeVar("_T")


class SqliteResourceRepository:
    def __init__(self, connection: sqlite3.Connection):
        self._connection = connection
        self._lock = RLock()

    def load_sources(self) -> list[StoredSource]:
        with self._lock:
            try:
                rows = self._connection.execute(
                    "SELECT payload_json FROM stored_sources ORDER BY source_id"
                ).fetchall()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="resource.load_sources",
                ) from error
        sources: list[StoredSource] = []
        for row in rows:
            try:
                payload = json.loads(row["payload_json"])
                if isinstance(payload, dict):
                    sources.append(StoredSource.model_validate(payload))
            except Exception:
                continue
        return sources

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

    def save_source(self, source: StoredSource) -> StoredSource:
        payload_json = json.dumps(source.model_dump(), ensure_ascii=False)
        now = time.time()
        with self._lock:
            self._write(
                "resource.save_source",
                lambda: self._connection.execute(
                    """
                    INSERT INTO stored_sources(source_id, payload_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(source_id) DO UPDATE SET
                        payload_json = excluded.payload_json,
                        updated_at = excluded.updated_at
                    """,
                    (source.id, payload_json, now),
                ),
            )
        return source

    def upsert_migration_sources(self, sources: list[StoredSource]) -> list[str]:
        if not sources:
            return []

        with self._lock:
            migrated_source_ids: list[str] = []
            seen: set[str] = set()

            def _upsert_sources() -> list[str]:
                now = time.time()
                for source in sources:
                    self._connection.execute(
                        """
                        INSERT INTO stored_sources(source_id, payload_json, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(source_id) DO UPDATE SET
                            payload_json = excluded.payload_json,
                            updated_at = excluded.updated_at
                        """,
                        (source.id, json.dumps(source.model_dump(), ensure_ascii=False), now),
                    )
                    if source.id not in seen:
                        seen.add(source.id)
                        migrated_source_ids.append(source.id)
                return migrated_source_ids

            return self._write("resource.upsert_migration_sources", _upsert_sources)

    def delete_source(self, source_id: str) -> bool:
        with self._lock:
            cursor = self._write(
                "resource.delete_source",
                lambda: self._connection.execute(
                    "DELETE FROM stored_sources WHERE source_id = ?",
                    (source_id,),
                ),
            )
        return cursor.rowcount > 0

    def get_source(self, source_id: str) -> StoredSource | None:
        with self._lock:
            try:
                row = self._connection.execute(
                    "SELECT payload_json FROM stored_sources WHERE source_id = ?",
                    (source_id,),
                ).fetchone()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="resource.get_source",
                ) from error
        if row is None:
            return None
        try:
            payload = json.loads(row["payload_json"])
            if not isinstance(payload, dict):
                return None
            return StoredSource.model_validate(payload)
        except Exception:
            return None

    def load_views(self) -> list[StoredView]:
        with self._lock:
            try:
                rows = self._connection.execute(
                    "SELECT payload_json FROM stored_views ORDER BY view_id"
                ).fetchall()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="resource.load_views",
                ) from error
        views: list[StoredView] = []
        for row in rows:
            try:
                payload = json.loads(row["payload_json"])
                if isinstance(payload, dict):
                    views.append(StoredView.model_validate(payload))
            except Exception:
                continue
        return views

    def save_view(self, view: StoredView) -> StoredView:
        payload_json = json.dumps(view.model_dump(), ensure_ascii=False)
        now = time.time()
        with self._lock:
            self._write(
                "resource.save_view",
                lambda: self._connection.execute(
                    """
                    INSERT INTO stored_views(view_id, payload_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(view_id) DO UPDATE SET
                        payload_json = excluded.payload_json,
                        updated_at = excluded.updated_at
                    """,
                    (view.id, payload_json, now),
                ),
            )
        return view

    def upsert_migration_views(self, views: list[StoredView]) -> list[str]:
        if not views:
            return []

        with self._lock:
            migrated_view_ids: list[str] = []
            seen: set[str] = set()

            def _upsert_views() -> list[str]:
                now = time.time()
                for view in views:
                    self._connection.execute(
                        """
                        INSERT INTO stored_views(view_id, payload_json, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(view_id) DO UPDATE SET
                            payload_json = excluded.payload_json,
                            updated_at = excluded.updated_at
                        """,
                        (view.id, json.dumps(view.model_dump(), ensure_ascii=False), now),
                    )
                    if view.id not in seen:
                        seen.add(view.id)
                        migrated_view_ids.append(view.id)
                return migrated_view_ids

            return self._write("resource.upsert_migration_views", _upsert_views)

    def delete_view(self, view_id: str) -> bool:
        with self._lock:
            cursor = self._write(
                "resource.delete_view",
                lambda: self._connection.execute(
                    "DELETE FROM stored_views WHERE view_id = ?",
                    (view_id,),
                ),
            )
        return cursor.rowcount > 0

    def get_view(self, view_id: str) -> StoredView | None:
        with self._lock:
            try:
                row = self._connection.execute(
                    "SELECT payload_json FROM stored_views WHERE view_id = ?",
                    (view_id,),
                ).fetchone()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="resource.get_view",
                ) from error
        if row is None:
            return None
        try:
            payload = json.loads(row["payload_json"])
            if not isinstance(payload, dict):
                return None
            return StoredView.model_validate(payload)
        except Exception:
            return None

    def remove_source_references_from_views(self, source_id: str) -> list[str]:
        views = self.load_views()
        if not views:
            return []

        affected_view_ids: list[str] = []
        with self._lock:
            def _update_references() -> None:
                for view in views:
                    retained_items = [item for item in view.items if item.source_id != source_id]
                    if len(retained_items) == len(view.items):
                        continue
                    affected_view_ids.append(view.id)
                    updated_view = view.model_copy(update={"items": retained_items})
                    self._connection.execute(
                        "UPDATE stored_views SET payload_json = ?, updated_at = ? WHERE view_id = ?",
                        (
                            json.dumps(updated_view.model_dump(), ensure_ascii=False),
                            time.time(),
                            view.id,
                        ),
                    )

            self._write("resource.remove_source_references_from_views", _update_references)

        return affected_view_ids
