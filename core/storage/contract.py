from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from core.models import StoredSource, StoredView
from core.settings_manager import SystemSettings

STORAGE_SCHEMA_VERSION = 1
DEFAULT_STORAGE_FILE = "storage.db"


class RuntimeStore(Protocol):
    def upsert(self, source_id: str, data: dict[str, Any]) -> None: ...

    def set_error(self, source_id: str, error: str) -> None: ...

    def set_state(
        self,
        source_id: str,
        status: str,
        message: str | None = None,
        interaction: dict[str, Any] | None = None,
        error: str | None = None,
        error_code: str | None = None,
    ) -> None: ...

    def set_retry_metadata(self, source_id: str, metadata: dict[str, Any] | None) -> None: ...

    def clear_retry_metadata(self, source_id: str) -> None: ...

    def get_latest(self, source_id: str) -> dict[str, Any] | None: ...

    def get_all_latest(self) -> list[dict[str, Any]]: ...

    def get_history(self, source_id: str, limit: int = 100) -> list[dict[str, Any]]: ...

    def clear_source(self, source_id: str) -> None: ...


class ResourceStore(Protocol):
    def load_sources(self) -> list[StoredSource]: ...

    def save_source(self, source: StoredSource) -> StoredSource: ...

    def delete_source(self, source_id: str) -> bool: ...

    def get_source(self, source_id: str) -> StoredSource | None: ...

    def load_views(self) -> list[StoredView]: ...

    def save_view(self, view: StoredView) -> StoredView: ...

    def delete_view(self, view_id: str) -> bool: ...

    def get_view(self, view_id: str) -> StoredView | None: ...

    def remove_source_references_from_views(self, source_id: str) -> list[str]: ...


class SettingsStore(Protocol):
    def load_settings(self) -> SystemSettings: ...

    def save_settings(self, settings: SystemSettings) -> None: ...


class TrustRuleStore(Protocol):
    def upsert_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
        decision: str,
        metadata: dict[str, Any] | None = None,
        expires_at: float | None = None,
    ) -> Any: ...

    def find_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
    ) -> Any | None: ...

    def delete_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
    ) -> bool: ...


@dataclass(slots=True)
class StorageContract:
    runtime: RuntimeStore
    resources: ResourceStore
    settings: SettingsStore
    trust_rules: TrustRuleStore | None = None
