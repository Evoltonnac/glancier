from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import AppConfig
from core.models import StoredSource
from core.storage.errors import (
    StorageIntegrityViolationError,
    StorageReadError,
    StorageSchemaMismatchError,
    StorageWriteError,
)


class _StubResourceManager:
    def __init__(self):
        self._source = StoredSource(
            id="source-alpha",
            integration_id="integration-alpha",
            name="Alpha Source",
            config={},
            vars={},
        )

    def load_sources(self) -> list[StoredSource]:
        return [self._source]

    def save_source(self, source: StoredSource) -> StoredSource:
        return source

    def delete_source(self, _source_id: str) -> bool:
        return True

    def remove_source_references_from_views(self, _source_id: str) -> list[str]:
        return []

    def load_views(self) -> list[Any]:
        return []

    def delete_view(self, _view_id: str) -> bool:
        return True


class _StubDataController:
    def get_latest(self, _source_id: str) -> dict[str, Any] | None:
        return {"source_id": "source-alpha", "data": {"value": 1}}

    def get_history(self, _source_id: str, limit: int = 100) -> list[dict[str, Any]]:
        return []

    def clear_source(self, _source_id: str) -> None:
        return None


def _build_client(resource_manager, data_controller) -> TestClient:
    api_module.init_api(
        executor=SimpleNamespace(get_source_state=lambda _source_id: None, _states={}),
        data_controller=data_controller,
        config=AppConfig(),
        auth_manager=SimpleNamespace(_handlers={}, clear_error=lambda _source_id: None),
        secrets_controller=SimpleNamespace(delete_secrets=lambda _source_id: None),
        resource_manager=resource_manager,
        integration_manager=SimpleNamespace(),
        settings_manager=None,
        master_key_provider=None,
        scraper_task_store=None,
    )

    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app, raise_server_exceptions=False)


def test_list_sources_returns_storage_read_failed_error_code():
    class _FailingResourceManager(_StubResourceManager):
        def load_sources(self) -> list[StoredSource]:
            raise StorageReadError("read failed")

    client = _build_client(_FailingResourceManager(), _StubDataController())

    response = client.get("/api/sources")

    assert response.status_code == 500
    payload = response.json()
    assert payload["error_code"] == "storage.read_failed"
    assert payload["error"]["code"] == "storage.read_failed"


def test_get_data_returns_storage_schema_mismatch_error_code():
    class _FailingDataController(_StubDataController):
        def get_latest(self, _source_id: str) -> dict[str, Any] | None:
            raise StorageSchemaMismatchError("schema mismatch")

    client = _build_client(_StubResourceManager(), _FailingDataController())

    response = client.get("/api/data/source-alpha")

    assert response.status_code == 503
    payload = response.json()
    assert payload["error_code"] == "storage.schema_mismatch"
    assert payload["error"]["code"] == "storage.schema_mismatch"


def test_create_source_returns_storage_write_failed_error_code():
    class _FailingResourceManager(_StubResourceManager):
        def save_source(self, source: StoredSource) -> StoredSource:
            raise StorageWriteError(f"write failed for {source.id}")

    client = _build_client(_FailingResourceManager(), _StubDataController())

    response = client.post(
        "/api/sources",
        json={
            "id": "source-bravo",
            "integration_id": "integration-alpha",
            "name": "Bravo Source",
            "config": {},
            "vars": {},
        },
    )

    assert response.status_code == 500
    payload = response.json()
    assert payload["error_code"] == "storage.write_failed"
    assert payload["error"]["code"] == "storage.write_failed"


def test_delete_source_cleanup_returns_storage_integrity_error_code():
    class _FailingDataController(_StubDataController):
        def clear_source(self, _source_id: str) -> None:
            raise StorageIntegrityViolationError("integrity violation")

    client = _build_client(_StubResourceManager(), _FailingDataController())

    response = client.delete("/api/sources/source-alpha")

    assert response.status_code == 500
    payload = response.json()
    assert payload["error_code"] == "storage.integrity_violation"
    assert payload["error"]["code"] == "storage.integrity_violation"


def test_non_storage_endpoint_success_contract_unchanged():
    client = _build_client(_StubResourceManager(), _StubDataController())

    response = client.get("/api/system/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

