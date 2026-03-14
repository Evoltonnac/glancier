from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import IntegrationConfig
from core.models import StoredSource
from core.settings_manager import SystemSettings


class _MockResourceManager:
    def __init__(self, sources: list[StoredSource]):
        self._sources = list(sources)

    def load_sources(self) -> list[StoredSource]:
        return list(self._sources)

    def save_source(self, source: StoredSource) -> StoredSource:
        for index, existing in enumerate(self._sources):
            if existing.id == source.id:
                self._sources[index] = source
                break
        else:
            self._sources.append(source)
        return source


class _MockDataController:
    def __init__(self, latest_by_source: dict[str, dict]):
        self._latest_by_source = latest_by_source

    def get_latest(self, source_id: str):
        return self._latest_by_source.get(source_id)


class _MockConfig:
    def __init__(self, integrations: dict[str, IntegrationConfig]):
        self._integrations = integrations
        self.integrations = list(integrations.values())

    def get_integration(self, integration_id: str):
        return self._integrations.get(integration_id)


class _MockAuthManager:
    def get_source_error(self, source_id: str):
        _ = source_id
        return None

    def get_oauth_handler(self, source_id: str):
        _ = source_id
        return None


class _MockSettingsManager:
    def __init__(self, settings: SystemSettings):
        self._settings = settings

    def load_settings(self) -> SystemSettings:
        return self._settings


def _build_client(
    *,
    sources: list[StoredSource],
    integrations: dict[str, IntegrationConfig],
    latest_by_source: dict[str, dict] | None = None,
    settings: SystemSettings | None = None,
) -> TestClient:
    resource_manager = _MockResourceManager(sources)
    data_controller = _MockDataController(latest_by_source or {})
    config = _MockConfig(integrations)
    settings_manager = _MockSettingsManager(settings or SystemSettings())

    api_module.init_api(
        SimpleNamespace(get_source_state=lambda _source_id: None),
        data_controller,
        config,
        _MockAuthManager(),
        SimpleNamespace(),
        resource_manager,
        SimpleNamespace(),
        settings_manager,
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app)


def test_list_sources_resolves_refresh_interval_priority():
    integrations = {
        "with-default": IntegrationConfig(
            id="with-default",
            flow=[],
            default_refresh_interval_minutes=5,
        ),
        "without-default": IntegrationConfig(id="without-default", flow=[]),
    }
    sources = [
        StoredSource(
            id="src-integration",
            integration_id="with-default",
            name="src-integration",
            config={},
            vars={},
        ),
        StoredSource(
            id="src-source",
            integration_id="with-default",
            name="src-source",
            config={"refresh_interval_minutes": 60},
            vars={},
        ),
        StoredSource(
            id="src-disabled",
            integration_id="with-default",
            name="src-disabled",
            config={"refresh_interval_minutes": 0},
            vars={},
        ),
        StoredSource(
            id="src-global",
            integration_id="without-default",
            name="src-global",
            config={"refresh_interval_minutes": None},
            vars={},
        ),
    ]
    latest = {
        "src-integration": {
            "source_id": "src-integration",
            "data": {"value": 1},
            "updated_at": 1000.0,
            "last_success_at": 900.0,
        },
        "src-global": {
            "source_id": "src-global",
            "data": {"value": 2},
            "updated_at": 1200.0,
        },
    }
    client = _build_client(
        sources=sources,
        integrations=integrations,
        latest_by_source=latest,
        settings=SystemSettings(refresh_interval_minutes=30),
    )

    payload = client.get("/api/sources")
    assert payload.status_code == 200

    entries = {entry["id"]: entry for entry in payload.json()}
    assert entries["src-integration"]["effective_refresh_interval_minutes"] == 5
    assert entries["src-integration"]["effective_refresh_interval_source"] == "integration"
    assert entries["src-source"]["effective_refresh_interval_minutes"] == 60
    assert entries["src-source"]["effective_refresh_interval_source"] == "source"
    assert entries["src-disabled"]["effective_refresh_interval_minutes"] == 0
    assert entries["src-disabled"]["effective_refresh_interval_source"] == "source"
    assert entries["src-global"]["effective_refresh_interval_minutes"] == 30
    assert entries["src-global"]["effective_refresh_interval_source"] == "global"
    assert entries["src-integration"]["last_success_at"] == 900.0
    # Backward-compatible fallback when old record has no last_success_at.
    assert entries["src-global"]["last_success_at"] == 1200.0


def test_update_source_refresh_interval_endpoint():
    source = StoredSource(
        id="source-1",
        integration_id="demo",
        name="source-1",
        config={},
        vars={},
    )
    client = _build_client(
        sources=[source],
        integrations={"demo": IntegrationConfig(id="demo", flow=[])},
    )

    response = client.put(
        "/api/sources/source-1/refresh-interval",
        json={"interval_minutes": 15},
    )
    assert response.status_code == 200
    assert response.json()["refresh_interval_minutes"] == 15

    list_payload = client.get("/api/sources")
    listed = next(item for item in list_payload.json() if item["id"] == "source-1")
    assert listed["refresh_interval_minutes"] == 15
    assert listed["effective_refresh_interval_minutes"] == 15
    assert listed["effective_refresh_interval_source"] == "source"

    unset_response = client.put(
        "/api/sources/source-1/refresh-interval",
        json={"interval_minutes": None},
    )
    assert unset_response.status_code == 200
    assert unset_response.json()["refresh_interval_minutes"] is None

    list_after_unset = client.get("/api/sources")
    listed_after_unset = next(
        item for item in list_after_unset.json() if item["id"] == "source-1"
    )
    assert listed_after_unset["refresh_interval_minutes"] is None
    assert listed_after_unset["effective_refresh_interval_source"] == "global"


def test_update_source_refresh_interval_rejects_invalid_value():
    source = StoredSource(
        id="source-1",
        integration_id="demo",
        name="source-1",
        config={},
        vars={},
    )
    client = _build_client(
        sources=[source],
        integrations={"demo": IntegrationConfig(id="demo", flow=[])},
    )

    response = client.put(
        "/api/sources/source-1/refresh-interval",
        json={"interval_minutes": 7},
    )
    assert response.status_code == 400
