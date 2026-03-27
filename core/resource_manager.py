"""
Resource manager backed by the storage contract resource store.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Callable, Optional, TypeVar

from core.models import StoredSource, StoredView
from core.storage.contract import ResourceStore, StorageContract
from core.storage.errors import StorageContractError, map_sqlite_error
from core.storage.sqlite_connection import create_sqlite_connection
from core.storage.sqlite_resource_repo import SqliteResourceRepository

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data"
_T = TypeVar("_T")


class ResourceManager:
    """Manages stored Sources and Views delegated to ResourceStore."""

    def __init__(
        self,
        data_dir: Path = DATA_DIR,
        resource_store: ResourceStore | None = None,
        storage: StorageContract | None = None,
    ):
        if resource_store is not None and storage is not None:
            raise ValueError("resource_store and storage are mutually exclusive")

        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.sources_file = self.data_dir / "sources.json"
        self.views_file = self.data_dir / "views.json"
        self._owned_connection = None

        if resource_store is not None:
            self._resource_store = resource_store
        elif storage is not None:
            self._resource_store = storage.resources
        else:
            db_path = self.data_dir / "storage.db"
            connection = create_sqlite_connection(db_path)
            self._owned_connection = connection
            self._resource_store = SqliteResourceRepository(connection)
            logger.info("SQLite resource store opened: %s", db_path)

    def _with_storage_call(
        self,
        *,
        kind: str,
        operation: str,
        action: Callable[[], _T],
    ) -> _T:
        try:
            return action()
        except StorageContractError:
            raise
        except sqlite3.Error as error:
            raise map_sqlite_error(error, kind=kind, operation=operation) from error

    def load_sources(self) -> list[StoredSource]:
        return self._with_storage_call(
            kind="read",
            operation="resource_manager.load_sources",
            action=self._resource_store.load_sources,
        )

    def save_source(self, source: StoredSource) -> StoredSource:
        return self._with_storage_call(
            kind="write",
            operation="resource_manager.save_source",
            action=lambda: self._resource_store.save_source(source),
        )

    def delete_source(self, source_id: str) -> bool:
        return self._with_storage_call(
            kind="write",
            operation="resource_manager.delete_source",
            action=lambda: self._resource_store.delete_source(source_id),
        )

    def get_source(self, source_id: str) -> Optional[StoredSource]:
        return self._with_storage_call(
            kind="read",
            operation="resource_manager.get_source",
            action=lambda: self._resource_store.get_source(source_id),
        )

    def load_views(self) -> list[StoredView]:
        return self._with_storage_call(
            kind="read",
            operation="resource_manager.load_views",
            action=self._resource_store.load_views,
        )

    def save_view(self, view: StoredView) -> StoredView:
        return self._with_storage_call(
            kind="write",
            operation="resource_manager.save_view",
            action=lambda: self._resource_store.save_view(view),
        )

    def reorder_views(self, ordered_view_ids: list[str]) -> list[StoredView]:
        return self._with_storage_call(
            kind="write",
            operation="resource_manager.reorder_views",
            action=lambda: self._resource_store.reorder_views(ordered_view_ids),
        )

    def delete_view(self, view_id: str) -> bool:
        return self._with_storage_call(
            kind="write",
            operation="resource_manager.delete_view",
            action=lambda: self._resource_store.delete_view(view_id),
        )

    def get_view(self, view_id: str) -> Optional[StoredView]:
        return self._with_storage_call(
            kind="read",
            operation="resource_manager.get_view",
            action=lambda: self._resource_store.get_view(view_id),
        )

    def remove_source_references_from_views(self, source_id: str) -> list[str]:
        return self._with_storage_call(
            kind="write",
            operation="resource_manager.remove_source_references_from_views",
            action=lambda: self._resource_store.remove_source_references_from_views(source_id),
        )

    def close(self) -> None:
        if self._owned_connection is None:
            return None
        self._owned_connection.close()
        self._owned_connection = None
        return None
