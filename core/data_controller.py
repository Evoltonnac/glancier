"""
Data controller backed by the storage contract runtime store.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Callable, TypeVar

from core.source_update_events import SourceUpdateEventBus
from core.storage.contract import RuntimeStore, StorageContract
from core.storage.errors import StorageContractError, map_sqlite_error
from core.storage.sqlite_connection import create_sqlite_connection
from core.storage.sqlite_runtime_repo import SqliteRuntimeRepository

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data"
_T = TypeVar("_T")


class DataController:
    """Runtime data operations wrapper delegated to RuntimeStore."""

    def __init__(
        self,
        db_path: str | Path | None = None,
        runtime_store: RuntimeStore | None = None,
        storage: StorageContract | None = None,
        source_update_bus: SourceUpdateEventBus | None = None,
    ):
        if runtime_store is not None and storage is not None:
            raise ValueError("runtime_store and storage are mutually exclusive")

        self._owned_connection = None
        if runtime_store is not None:
            self._runtime_store = runtime_store
        elif storage is not None:
            self._runtime_store = storage.runtime
        else:
            resolved_path = Path(db_path) if db_path is not None else (_DATA_DIR / "storage.db")
            connection = create_sqlite_connection(resolved_path)
            self._owned_connection = connection
            self._runtime_store = SqliteRuntimeRepository(connection)
            logger.info("SQLite runtime store opened: %s", resolved_path)
        self._source_update_bus = source_update_bus

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

    def upsert(self, source_id: str, data: dict[str, Any]) -> None:
        self._with_storage_call(
            kind="write",
            operation="data_controller.upsert",
            action=lambda: self._runtime_store.upsert(source_id, data),
        )
        if self._source_update_bus is not None:
            self._source_update_bus.publish_source_updated(
                source_id,
                event_type="detail_updated",
            )

    def set_error(self, source_id: str, error: str) -> None:
        self._with_storage_call(
            kind="write",
            operation="data_controller.set_error",
            action=lambda: self._runtime_store.set_error(source_id, error),
        )
        if self._source_update_bus is not None:
            self._source_update_bus.publish_source_updated(
                source_id,
                event_type="error_updated",
            )

    def set_state(
        self,
        source_id: str,
        status: str,
        message: str | None = None,
        interaction: dict | None = None,
        error: str | None = None,
        error_code: str | None = None,
    ) -> None:
        self._with_storage_call(
            kind="write",
            operation="data_controller.set_state",
            action=lambda: self._runtime_store.set_state(
                source_id=source_id,
                status=status,
                message=message,
                interaction=interaction,
                error=error,
                error_code=error_code,
            ),
        )
        if self._source_update_bus is not None:
            self._source_update_bus.publish_source_updated(
                source_id,
                event_type="state_updated",
                status=status,
                error_code=error_code,
            )

    def set_retry_metadata(self, source_id: str, metadata: dict[str, Any] | None) -> None:
        self._with_storage_call(
            kind="write",
            operation="data_controller.set_retry_metadata",
            action=lambda: self._runtime_store.set_retry_metadata(source_id, metadata),
        )

    def clear_retry_metadata(self, source_id: str) -> None:
        self._with_storage_call(
            kind="write",
            operation="data_controller.clear_retry_metadata",
            action=lambda: self._runtime_store.clear_retry_metadata(source_id),
        )

    def get_latest(self, source_id: str) -> dict | None:
        return self._with_storage_call(
            kind="read",
            operation="data_controller.get_latest",
            action=lambda: self._runtime_store.get_latest(source_id),
        )

    def get_all_latest(self) -> list[dict]:
        return self._with_storage_call(
            kind="read",
            operation="data_controller.get_all_latest",
            action=lambda: self._runtime_store.get_all_latest(),
        )

    def get_history(self, source_id: str, limit: int = 100) -> list[dict]:
        return self._with_storage_call(
            kind="read",
            operation="data_controller.get_history",
            action=lambda: self._runtime_store.get_history(source_id, limit=limit),
        )

    def clear_source(self, source_id: str) -> None:
        self._with_storage_call(
            kind="write",
            operation="data_controller.clear_source",
            action=lambda: self._runtime_store.clear_source(source_id),
        )

    def close(self) -> None:
        if self._owned_connection is None:
            return None
        self._owned_connection.close()
        self._owned_connection = None
        return None
