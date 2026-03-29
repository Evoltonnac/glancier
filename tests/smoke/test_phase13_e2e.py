from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import AppConfig
from core.integration_manager import IntegrationManager
from core.models import StoredSource, StoredView
from core.source_state import InteractionRequest, InteractionType, SourceState, SourceStatus
from tests.factories import build_source_config


@dataclass
class InMemoryResourceManager:
    sources: list[StoredSource] = field(default_factory=list)
    views: list[StoredView] = field(default_factory=list)

    def load_sources(self) -> list[StoredSource]:
        return list(self.sources)

    def save_source(self, source: StoredSource) -> StoredSource:
        self.sources = [s for s in self.sources if s.id != source.id] + [source]
        return source

    def delete_source(self, source_id: str) -> bool:
        before = len(self.sources)
        self.sources = [s for s in self.sources if s.id != source_id]
        return len(self.sources) < before

    def load_views(self) -> list[StoredView]:
        return list(self.views)

    def save_view(self, view: StoredView) -> StoredView:
        self.views = [v for v in self.views if v.id != view.id] + [view]
        return view

    def delete_view(self, view_id: str) -> bool:
        before = len(self.views)
        self.views = [v for v in self.views if v.id != view_id]
        return len(self.views) < before


class InMemorySecretsController:
    def __init__(self) -> None:
        self.data: dict[str, dict[str, Any]] = {}

    def set_secrets(self, source_id: str, values: dict[str, Any]) -> None:
        bucket = self.data.setdefault(source_id, {})
        bucket.update(values)


class FakeExecutor:
    def __init__(self) -> None:
        self.states: dict[str, SourceState] = {}
        self.fetch_calls: list[str] = []
        self.state_updates: list[tuple[str, SourceStatus, str]] = []

    def get_source_state(self, source_id: str) -> SourceState:
        return self.states.get(source_id, SourceState(source_id=source_id))

    def _update_state(self, source_id: str, status: SourceStatus, message: str) -> None:
        self.state_updates.append((source_id, status, message))
        self.states[source_id] = SourceState(
            source_id=source_id,
            status=status,
            message=message,
        )

    def fetch_source(self, source) -> None:
        self.fetch_calls.append(source.id)


class FakeOAuthHandler:
    def __init__(self) -> None:
        self.exchange_calls: list[tuple[str, str | None, str | None]] = []

    def get_authorize_url(self, redirect_uri: str | None = None) -> str:
        redirect = redirect_uri or "http://localhost/callback"
        return f"https://oauth.example/authorize?redirect_uri={redirect}"

    async def start_authorization(self, redirect_uri: str | None = None) -> dict[str, str]:
        return {
            "flow": "code",
            "authorize_url": self.get_authorize_url(redirect_uri=redirect_uri),
        }

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str | None = None,
        state: str | None = None,
    ) -> None:
        self.exchange_calls.append((code, redirect_uri, state))


class FakeAuthManager:
    def __init__(self, handlers: dict[str, FakeOAuthHandler] | None = None) -> None:
        self.handlers = handlers or {}

    def get_oauth_handler(self, source_id: str):
        return self.handlers.get(source_id)

    def register_source(self, source) -> None:
        # OAuth handlers are pre-seeded in tests. No-op registration.
        _ = source

    def get_source_error(self, source_id: str):
        _ = source_id
        return None


def _build_client(tmp_path, monkeypatch):
    executor = FakeExecutor()
    resource_manager = InMemoryResourceManager()
    auth_manager = FakeAuthManager()
    integration_manager = IntegrationManager(config_root=str(tmp_path / "config"))
    secrets = InMemorySecretsController()

    monkeypatch.setattr(
        api_module,
        "_resolve_stored_source",
        lambda stored: build_source_config(source_id=stored.id, name=stored.name, flow=[]),
    )

    api_module.init_api(
        executor=executor,
        data_controller=SimpleNamespace(
            get_latest=lambda _source_id: None,
            get_history=lambda _source_id, _limit=100: [],
        ),
        config=AppConfig(),
        auth_manager=auth_manager,
        secrets_controller=secrets,
        resource_manager=resource_manager,
        integration_manager=integration_manager,
        settings_manager=None,
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app), executor, resource_manager, auth_manager, secrets


def test_integration_source_refresh_smoke_flow(tmp_path, monkeypatch):
    client, executor, _, _, _ = _build_client(tmp_path, monkeypatch)

    create_integration = client.post(
        "/api/integrations/files",
        params={"filename": "demo.yaml"},
        json={"content": "flow: []\n"},
    )
    assert create_integration.status_code == 200

    create_source = client.post(
        "/api/sources",
        json={
            "id": "phase13-demo-source",
            "integration_id": "demo",
            "name": "Phase13 Demo Source",
            "config": {},
            "vars": {},
        },
    )
    assert create_source.status_code == 200
    assert create_source.json()["id"] == "phase13-demo-source"

    refresh = client.post("/api/refresh/phase13-demo-source")
    assert refresh.status_code == 200
    assert refresh.json()["source_id"] == "phase13-demo-source"
    assert "phase13-demo-source" in executor.fetch_calls


def test_oauth_authorize_and_code_exchange_smoke_flow(tmp_path, monkeypatch):
    client, executor, resource_manager, auth_manager, _ = _build_client(tmp_path, monkeypatch)

    source_id = "oauth-source-phase13"
    resource_manager.save_source(
        StoredSource(
            id=source_id,
            integration_id="demo",
            name="OAuth Source",
            config={},
            vars={},
        )
    )
    handler = FakeOAuthHandler()
    auth_manager.handlers[source_id] = handler

    authorize = client.get(
        f"/api/oauth/authorize/{source_id}",
        params={"redirect_uri": "http://localhost:3000/oauth/callback"},
    )
    assert authorize.status_code == 200
    assert "authorize_url" in authorize.json()

    interact = client.post(
        f"/api/sources/{source_id}/interact",
        json={
            "type": "oauth_code_exchange",
            "code": "phase13-code",
            "state": "phase13-state",
            "redirect_uri": "http://localhost:3000/oauth/callback",
        },
    )
    assert interact.status_code == 200
    assert handler.exchange_calls == [
        ("phase13-code", "http://localhost:3000/oauth/callback", "phase13-state")
    ]
    assert source_id in executor.fetch_calls


def test_webview_interaction_smoke_flow_updates_secrets_and_state(tmp_path, monkeypatch):
    client, executor, resource_manager, _, secrets = _build_client(tmp_path, monkeypatch)

    source_id = "webview-source-phase13"
    resource_manager.save_source(
        StoredSource(
            id=source_id,
            integration_id="demo",
            name="Webview Source",
            config={},
            vars={},
        )
    )
    executor.states[source_id] = SourceState(
        source_id=source_id,
        status=SourceStatus.SUSPENDED,
        interaction=InteractionRequest(
            type=InteractionType.WEBVIEW_SCRAPE,
            source_id=source_id,
            title="Continue in webview",
            message="Need user context",
            data={"secret_key": "session_cookie"},
        ),
    )

    interact = client.post(
        f"/api/sources/{source_id}/interact",
        json={"session_cookie": "cookie-value"},
    )
    assert interact.status_code == 200
    assert secrets.data[source_id]["session_cookie"] == "cookie-value"
    assert any(
        update[0] == source_id and update[1] == SourceStatus.REFRESHING
        for update in executor.state_updates
    )
