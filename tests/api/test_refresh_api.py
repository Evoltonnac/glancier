from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.source_state import InteractionType, SourceStatus
from tests.helpers.mock_runtime import (
    make_api_runtime,
    make_integration_config,
    make_stored_source,
)


def _build_client(runtime: dict):
    api_module.init_api(
        runtime["executor"],
        runtime["data_controller"],
        runtime["config"],
        runtime["auth_manager"],
        runtime["secrets_controller"],
        runtime["resource_manager"],
        runtime["integration_manager"],
        runtime["settings_manager"],
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app)


class _MockOAuthHandler:
    def __init__(self) -> None:
        self.config = SimpleNamespace(authorization_code_field="auth_code")
        self.exchange_calls: list[tuple[str, str | None, str | None]] = []

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str | None = None,
        state: str | None = None,
    ) -> None:
        self.exchange_calls.append((code, redirect_uri, state))


def test_refresh_source_returns_409_when_integration_is_missing():
    source = make_stored_source(
        "openrouter",
        integration_id="openrouter_keys_apikey",
    )
    runtime = make_api_runtime(sources=[source], integrations={})
    client = _build_client(runtime)

    response = client.post("/api/refresh/openrouter")

    assert response.status_code == 409
    assert "openrouter_keys_apikey" in response.json()["detail"]


def test_refresh_source_stays_stable_after_successful_oauth_callback_exchange():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
    )
    runtime["secrets_controller"] = SimpleNamespace(
        get_secrets=lambda source_id: {
            "oauth_pkce": {"state": "state-ok" if source_id == "oauth-source" else "other-state"}
        },
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    callback_response = client.post(
        "/api/oauth/callback/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-ok",
            "state": "state-ok",
            "redirect_uri": "http://localhost:5173/oauth/callback",
        },
    )
    assert callback_response.status_code == 200
    assert callback_response.json()["source_id"] == "oauth-source"
    assert handler.exchange_calls == [
        ("code-ok", "http://localhost:5173/oauth/callback", "state-ok")
    ]

    refresh_response = client.post("/api/refresh/oauth-source")

    assert refresh_response.status_code == 200
    assert refresh_response.json()["source_id"] == "oauth-source"
    runtime["executor"]._update_state.assert_called_with(
        "oauth-source",
        SourceStatus.REFRESHING,
        "Fetching latest data...",
    )


def test_refresh_source_stays_stable_after_oauth_state_rejection():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
    )
    runtime["secrets_controller"] = SimpleNamespace(
        get_secrets=lambda _source_id: {"oauth_pkce": {"state": "other-state"}},
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    callback_response = client.post(
        "/api/oauth/callback/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-invalid",
            "state": "missing-state",
            "redirect_uri": "http://localhost:5173/oauth/callback",
        },
    )
    assert callback_response.status_code == 400
    assert callback_response.json()["detail"] == "oauth_state_invalid"
    assert handler.exchange_calls == []

    refresh_response = client.post("/api/refresh/oauth-source")

    assert refresh_response.status_code == 200
    assert refresh_response.json()["source_id"] == "oauth-source"
    runtime["executor"]._update_state.assert_called_with(
        "oauth-source",
        SourceStatus.REFRESHING,
        "Fetching latest data...",
    )


def test_refresh_source_stays_stable_after_source_mismatch_rejection():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.INPUT_TEXT,
                source_id="oauth-source",
                fields=[SimpleNamespace(key="api_key")],
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    interaction_response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "input_text",
            "source_id": "another-source",
            "api_key": "sk-test",
        },
    )
    assert interaction_response.status_code == 400
    assert interaction_response.json()["detail"] == "interaction_source_mismatch"
    runtime["secrets_controller"].set_secrets.assert_not_called()

    refresh_response = client.post("/api/refresh/oauth-source")

    assert refresh_response.status_code == 200
    assert refresh_response.json()["source_id"] == "oauth-source"
    runtime["executor"]._update_state.assert_called_with(
        "oauth-source",
        SourceStatus.REFRESHING,
        "Fetching latest data...",
    )
