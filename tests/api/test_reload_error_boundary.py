from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import AppConfig
from core.integration_manager import IntegrationManager
from core.models import StoredSource


class _ReloadExecutorStub:
    def __init__(self) -> None:
        self.update_calls: list[tuple[str, str, str]] = []
        self.fetch_calls: list[str] = []

    def get_source_state(self, _source_id: str) -> SimpleNamespace:
        return SimpleNamespace(status=None, message=None, interaction=None)

    def update_source_state(self, _source_id: str, _state: SimpleNamespace) -> None:
        return None

    def _update_state(self, source_id: str, status, message: str) -> None:
        self.update_calls.append((source_id, status.value, message))

    async def fetch_source(self, source) -> None:
        self.fetch_calls.append(source.id)


def test_reload_returns_400_when_config_loader_raises(monkeypatch):
    api_module.init_api(
        executor=SimpleNamespace(),
        data_controller=SimpleNamespace(),
        config=AppConfig(),
        auth_manager=SimpleNamespace(),
        secrets_controller=SimpleNamespace(),
        resource_manager=SimpleNamespace(load_sources=lambda: []),
        integration_manager=SimpleNamespace(),
        settings_manager=None,
    )

    def _boom():
        raise RuntimeError("broken config")

    monkeypatch.setattr("core.config_loader.load_config", _boom)

    app = FastAPI()
    app.include_router(api_module.router)
    client = TestClient(app)

    response = client.post("/api/system/reload")

    assert response.status_code == 400
    payload = response.json()
    assert "Configuration reload failed" in payload["detail"]
    assert "broken config" in payload["detail"]
    assert payload["error"] == {
        "code": "config.reload_failed",
        "summary": "Configuration reload failed",
        "details": "broken config",
    }


def test_reload_updates_templates_from_external_integration_change(tmp_path, monkeypatch):
    monkeypatch.setenv("GLANCEUS_DATA_DIR", str(tmp_path))
    integrations_dir = tmp_path / "config" / "integrations"
    integrations_dir.mkdir(parents=True, exist_ok=True)
    (integrations_dir / "demo.yaml").write_text("flow: []\n", encoding="utf-8")

    api_module.init_api(
        executor=SimpleNamespace(
            get_source_state=lambda _source_id: SimpleNamespace(),
            update_source_state=lambda _source_id, _state: None,
        ),
        data_controller=SimpleNamespace(),
        config=AppConfig(),
        auth_manager=SimpleNamespace(),
        secrets_controller=SimpleNamespace(),
        resource_manager=SimpleNamespace(load_sources=lambda: []),
        integration_manager=IntegrationManager(config_root=str(tmp_path / "config")),
        settings_manager=None,
    )

    app = FastAPI()
    app.include_router(api_module.router)
    client = TestClient(app)

    before_resp = client.get("/api/integrations/demo/templates")
    assert before_resp.status_code == 404

    reload_resp = client.post("/api/system/reload")
    assert reload_resp.status_code == 200

    after_resp = client.get("/api/integrations/demo/templates")
    assert after_resp.status_code == 200
    assert after_resp.json() == []


def test_reload_view_only_change_does_not_auto_refresh_sources(tmp_path, monkeypatch):
    monkeypatch.setenv("GLANCEUS_DATA_DIR", str(tmp_path))
    integrations_dir = tmp_path / "config" / "integrations"
    integrations_dir.mkdir(parents=True, exist_ok=True)
    integration_file = integrations_dir / "demo.yaml"
    integration_file.write_text(
        """
name: Demo
flow:
  - id: fetch
    use: http
    args:
      url: https://api.example.com/data
templates:
  - id: card
    type: metric
    label: Old
""".strip(),
        encoding="utf-8",
    )

    from core.config_loader import load_config

    old_config = load_config()
    executor_stub = _ReloadExecutorStub()
    api_module.init_api(
        executor=executor_stub,
        data_controller=SimpleNamespace(),
        config=old_config,
        auth_manager=SimpleNamespace(),
        secrets_controller=SimpleNamespace(),
        resource_manager=SimpleNamespace(
            load_sources=lambda: [
                StoredSource(
                    id="source-1",
                    integration_id="demo",
                    name="Source One",
                    config={},
                    vars={},
                ),
            ],
        ),
        integration_manager=IntegrationManager(config_root=str(tmp_path / "config")),
        settings_manager=None,
    )

    integration_file.write_text(
        """
name: Demo
flow:
  - id: fetch
    use: http
    args:
      url: https://api.example.com/data
templates:
  - id: card
    type: metric
    label: New
""".strip(),
        encoding="utf-8",
    )

    app = FastAPI()
    app.include_router(api_module.router)
    client = TestClient(app)

    response = client.post("/api/system/reload")
    assert response.status_code == 200
    payload = response.json()

    assert payload["affected_sources"] == []
    assert payload["auto_refreshed_sources"] == []
    assert payload["changed_files"] == [
        {
            "filename": "demo.yaml",
            "integration_id": "demo",
            "change_scope": "view",
            "changed_fields": ["templates"],
            "related_sources": ["source-1"],
            "auto_refreshed_sources": [],
        },
    ]
    assert executor_stub.fetch_calls == []


def test_reload_logic_change_auto_refreshes_related_sources(tmp_path, monkeypatch):
    monkeypatch.setenv("GLANCEUS_DATA_DIR", str(tmp_path))
    integrations_dir = tmp_path / "config" / "integrations"
    integrations_dir.mkdir(parents=True, exist_ok=True)
    integration_file = integrations_dir / "demo.yaml"
    integration_file.write_text(
        """
name: Demo
flow:
  - id: fetch
    use: http
    args:
      url: https://api.example.com/data
templates:
  - id: card
    type: metric
    label: Stable
""".strip(),
        encoding="utf-8",
    )

    from core.config_loader import load_config

    old_config = load_config()
    executor_stub = _ReloadExecutorStub()
    api_module.init_api(
        executor=executor_stub,
        data_controller=SimpleNamespace(),
        config=old_config,
        auth_manager=SimpleNamespace(),
        secrets_controller=SimpleNamespace(),
        resource_manager=SimpleNamespace(
            load_sources=lambda: [
                StoredSource(
                    id="source-1",
                    integration_id="demo",
                    name="Source One",
                    config={},
                    vars={},
                ),
            ],
        ),
        integration_manager=IntegrationManager(config_root=str(tmp_path / "config")),
        settings_manager=None,
    )

    integration_file.write_text(
        """
name: Demo
flow:
  - id: fetch
    use: http
    args:
      url: https://api.example.com/new-data
templates:
  - id: card
    type: metric
    label: Stable
""".strip(),
        encoding="utf-8",
    )

    app = FastAPI()
    app.include_router(api_module.router)
    client = TestClient(app)

    response = client.post("/api/system/reload")
    assert response.status_code == 200
    payload = response.json()

    assert payload["affected_sources"] == ["source-1"]
    assert payload["auto_refreshed_sources"] == ["source-1"]
    assert payload["changed_files"] == [
        {
            "filename": "demo.yaml",
            "integration_id": "demo",
            "change_scope": "logic",
            "changed_fields": ["flow"],
            "related_sources": ["source-1"],
            "auto_refreshed_sources": ["source-1"],
        },
    ]
    assert executor_stub.fetch_calls == ["source-1"]
