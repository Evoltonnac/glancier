from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.source_state import InteractionType
from tests.helpers.mock_runtime import (
    make_api_runtime,
    make_integration_config,
    make_stored_source,
)


class _MockOAuthInteractionHandler:
    def __init__(self) -> None:
        self.config = SimpleNamespace(authorization_code_field="auth_code")
        self.exchange_calls: list[tuple[str, str | None, str | None]] = []
        self.saved_implicit_tokens: list[dict] = []

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str | None = None,
        state: str | None = None,
    ) -> None:
        self.exchange_calls.append((code, redirect_uri, state))

    def build_implicit_token_payload(self, data: dict) -> dict:
        payload_data = data.get("oauth_payload")
        payload = dict(payload_data) if isinstance(payload_data, dict) else {}
        provider_token = payload.get("provider_token")
        if provider_token:
            payload["access_token"] = provider_token
        return payload

    def store_implicit_token(self, payload: dict) -> None:
        self.saved_implicit_tokens.append(payload)


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
        trust_rule_repo=runtime.get("trust_rule_repo"),
        network_trust_policy=runtime.get("network_trust_policy"),
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app)


def test_interact_oauth_code_exchange_supports_custom_code_field():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.OAUTH_START,
                source_id="oauth-source",
                fields=[],
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-xyz",
            "state": "state-xyz",
            "redirect_uri": "http://localhost:5173/oauth/callback/oauth-source",
        },
    )

    assert response.status_code == 200
    assert handler.exchange_calls == [
        ("code-xyz", "http://localhost:5173/oauth/callback/oauth-source", "state-xyz")
    ]
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_oauth_implicit_token_supports_payload_builder_without_access_token_field():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.OAUTH_START,
                source_id="oauth-source",
                fields=[],
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "oauth_implicit_token",
            "oauth_payload": {
                "provider_token": "tok-xyz",
                "token_type": "Bearer",
                "expires_in": "3600",
            },
        },
    )

    assert response.status_code == 200
    assert handler.saved_implicit_tokens
    assert handler.saved_implicit_tokens[0]["access_token"] == "tok-xyz"
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_source_mismatch_rejects_body_source_override():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
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

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "input_text",
            "source_id": "another-source",
            "api_key": "sk-test",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "interaction_source_mismatch"
    runtime["secrets_controller"].set_secrets.assert_not_called()


def test_interact_interaction_payload_invalid_rejects_extra_keys():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
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

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "input_text",
            "api_key": "sk-test",
            "unexpected_key": "boom",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "interaction_payload_invalid"
    runtime["secrets_controller"].set_secrets.assert_not_called()


def test_interact_webview_scrape_accepts_runtime_secret_key_payload():
    source = make_stored_source("webview-source", integration_id="webview-integration")
    integration = make_integration_config("webview-integration", "none")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"webview-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.WEBVIEW_SCRAPE,
                source_id="webview-source",
                fields=[],
                data={"secret_key": "session_capture"},
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/webview-source/interact",
        json={"session_capture": {"foo": "bar"}},
    )

    assert response.status_code == 200
    runtime["secrets_controller"].set_secrets.assert_called_once_with(
        "webview-source",
        {"session_capture": {"foo": "bar"}},
    )
    runtime["executor"]._update_state.assert_called_once()
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_webview_scrape_rejects_unexpected_payload_key():
    source = make_stored_source("webview-source", integration_id="webview-integration")
    integration = make_integration_config("webview-integration", "none")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"webview-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.WEBVIEW_SCRAPE,
                source_id="webview-source",
                fields=[],
                data={"secret_key": "session_capture"},
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/webview-source/interact",
        json={"unexpected_key": {"foo": "bar"}},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "interaction_payload_invalid"
    runtime["secrets_controller"].set_secrets.assert_not_called()


def test_interact_same_source_input_text_still_succeeds():
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

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "input_text",
            "api_key": "sk-test",
        },
    )

    assert response.status_code == 200
    runtime["secrets_controller"].set_secrets.assert_called_once_with(
        "oauth-source",
        {"type": "input_text", "api_key": "sk-test"},
    )
    runtime["executor"]._update_state.assert_called_once()
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_oauth_code_exchange_succeeds_without_pending_runtime_interaction():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-no-pending",
            "state": "glanceus.b2F1dGgtc291cmNl.nonce",
            "redirect_uri": "http://localhost:5173/oauth/callback",
        },
    )

    assert response.status_code == 200
    assert handler.exchange_calls == [
        ("code-no-pending", "http://localhost:5173/oauth/callback", "glanceus.b2F1dGgtc291cmNl.nonce")
    ]
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_oauth_code_exchange_succeeds_with_stale_pending_interaction_type():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
        oauth_handlers={"oauth-source": handler},
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.INPUT_TEXT,
                source_id="oauth-source",
                fields=[],
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-stale",
            "state": "glanceus.b2F1dGgtc291cmNl.nonce2",
            "redirect_uri": "http://localhost:5173/oauth/callback",
        },
    )

    assert response.status_code == 200
    assert handler.exchange_calls == [
        ("code-stale", "http://localhost:5173/oauth/callback", "glanceus.b2F1dGgtc291cmNl.nonce2")
    ]
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_input_form_succeeds_with_persisted_pending_interaction_after_restart():
    source = make_stored_source("form-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["data_controller"] = SimpleNamespace(
        get_latest=lambda _source_id: {
            "source_id": "form-source",
            "status": "suspended",
            "interaction": {
                "type": "input_form",
                "source_id": "form-source",
                "fields": [
                    {"key": "username"},
                    {"key": "password"},
                ],
            },
        }
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/form-source/interact",
        json={
            "username": "alice",
            "password": "secret",
        },
    )

    assert response.status_code == 200
    runtime["secrets_controller"].set_secrets.assert_called_once_with(
        "form-source",
        {"username": "alice", "password": "secret"},
    )
    runtime["executor"]._update_state.assert_called_once()
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_input_form_prefers_persisted_pending_interaction_over_runtime_drift():
    source = make_stored_source("form-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["data_controller"] = SimpleNamespace(
        get_latest=lambda _source_id: {
            "source_id": "form-source",
            "status": "suspended",
            "interaction": {
                "type": "input_form",
                "source_id": "form-source",
                "fields": [
                    {"key": "username"},
                    {"key": "password"},
                ],
            },
        }
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(
            interaction=SimpleNamespace(
                type=InteractionType.INPUT_TEXT,
                source_id="form-source",
                fields=[SimpleNamespace(key="api_key")],
            ),
        ),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/form-source/interact",
        json={
            "username": "alice",
            "password": "secret",
        },
    )

    assert response.status_code == 200
    runtime["secrets_controller"].set_secrets.assert_called_once_with(
        "form-source",
        {"username": "alice", "password": "secret"},
    )
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_input_form_rejects_extra_keys_against_persisted_pending_interaction():
    source = make_stored_source("form-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["data_controller"] = SimpleNamespace(
        get_latest=lambda _source_id: {
            "source_id": "form-source",
            "status": "suspended",
            "interaction": {
                "type": "input_form",
                "source_id": "form-source",
                "fields": [
                    {"key": "username"},
                ],
            },
        }
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/form-source/interact",
        json={
            "username": "alice",
            "unexpected_key": "boom",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "interaction_payload_invalid"
    runtime["secrets_controller"].set_secrets.assert_not_called()


def test_interact_input_form_without_any_pending_interaction_still_rejects():
    source = make_stored_source("form-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["data_controller"] = SimpleNamespace(get_latest=lambda _source_id: None)
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/form-source/interact",
        json={
            "username": "alice",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "interaction_source_mismatch"
    runtime["secrets_controller"].set_secrets.assert_not_called()


def test_oauth_callback_interact_resolves_source_id_by_opaque_state():
    source_a = make_stored_source("oauth-source-a", integration_id="oauth-integration")
    source_b = make_stored_source("oauth-source-b", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler_a = _MockOAuthInteractionHandler()
    handler_b = _MockOAuthInteractionHandler()
    secrets_by_source = {
        "oauth-source-a": {"oauth_pkce": {"state": "state-a"}},
        "oauth-source-b": {"oauth_pkce": {"state": "state-b"}},
    }
    runtime = make_api_runtime(
        sources=[source_a, source_b],
        integrations={"oauth-integration": integration},
        oauth_handlers={
            "oauth-source-a": handler_a,
            "oauth-source-b": handler_b,
        },
    )
    runtime["secrets_controller"] = SimpleNamespace(
        get_secrets=lambda source_id: secrets_by_source.get(source_id, {}),
    )
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: None,
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/oauth/callback/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-xyz",
            "state": "state-b",
            "redirect_uri": "http://localhost:5173/oauth/callback",
        },
    )

    assert response.status_code == 200
    assert response.json()["source_id"] == "oauth-source-b"
    assert handler_a.exchange_calls == []
    assert handler_b.exchange_calls == [
        ("code-xyz", "http://localhost:5173/oauth/callback", "state-b")
    ]
    runtime["executor"].fetch_source.assert_called_once()


def test_oauth_callback_interact_rejects_unknown_state():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    handler = _MockOAuthInteractionHandler()
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

    response = client.post(
        "/api/oauth/callback/interact",
        json={
            "type": "oauth_code_exchange",
            "auth_code": "code-xyz",
            "state": "missing-state",
            "redirect_uri": "http://localhost:5173/oauth/callback",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "oauth_state_invalid"


def _build_network_trust_pending_state(source_id: str) -> SimpleNamespace:
    return SimpleNamespace(
        interaction=SimpleNamespace(
            type=InteractionType.CONFIRM,
            source_id=source_id,
            fields=[],
            data={
                "confirm_kind": "network_trust",
                "capability": "http",
                "target_type": "host",
                "target_value": "127.0.0.1",
                "target_key": "127.0.0.1",
            },
        ),
    )


def test_interact_network_trust_allow_once_bypasses_secrets_and_grants_ephemeral():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["network_trust_policy"] = SimpleNamespace(grant_allow_once=MagicMock())
    runtime["trust_rule_repo"] = SimpleNamespace(upsert_rule=MagicMock())
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: _build_network_trust_pending_state("oauth-source"),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "confirm",
            "decision": "allow_once",
            "scope": "source",
            "target_key": "127.0.0.1",
        },
    )

    assert response.status_code == 200
    runtime["network_trust_policy"].grant_allow_once.assert_called_once_with(
        capability="http",
        source_id="oauth-source",
        target_type="host",
        target_value="127.0.0.1",
    )
    runtime["trust_rule_repo"].upsert_rule.assert_not_called()
    runtime["secrets_controller"].set_secrets.assert_not_called()
    runtime["executor"].fetch_source.assert_called_once()


def test_interact_network_trust_allow_always_persists_rule():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["network_trust_policy"] = SimpleNamespace(grant_allow_once=MagicMock())
    runtime["trust_rule_repo"] = SimpleNamespace(upsert_rule=MagicMock())
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: _build_network_trust_pending_state("oauth-source"),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "confirm",
            "decision": "allow_always",
            "scope": "global",
            "target_key": "127.0.0.1",
        },
    )

    assert response.status_code == 200
    runtime["network_trust_policy"].grant_allow_once.assert_not_called()
    runtime["trust_rule_repo"].upsert_rule.assert_called_once()
    call_kwargs = runtime["trust_rule_repo"].upsert_rule.call_args.kwargs
    assert call_kwargs["capability"] == "http"
    assert call_kwargs["scope_type"] == "global"
    assert call_kwargs["source_id"] is None
    assert call_kwargs["target_type"] == "host"
    assert call_kwargs["target_value"] == "127.0.0.1"
    assert call_kwargs["decision"] == "allow"
    runtime["secrets_controller"].set_secrets.assert_not_called()


def test_interact_network_trust_rejects_malformed_payload():
    source = make_stored_source("oauth-source", integration_id="oauth-integration")
    integration = make_integration_config("oauth-integration", "oauth")
    runtime = make_api_runtime(
        sources=[source],
        integrations={"oauth-integration": integration},
    )
    runtime["secrets_controller"] = SimpleNamespace(set_secrets=MagicMock())
    runtime["network_trust_policy"] = SimpleNamespace(grant_allow_once=MagicMock())
    runtime["trust_rule_repo"] = SimpleNamespace(upsert_rule=MagicMock())
    runtime["executor"] = SimpleNamespace(
        get_source_state=lambda _source_id: _build_network_trust_pending_state("oauth-source"),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    client = _build_client(runtime)

    response = client.post(
        "/api/sources/oauth-source/interact",
        json={
            "type": "confirm",
            "decision": "allow_once",
            "scope": "source",
            "target_key": "127.0.0.1",
            "extra": "not-allowed",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "interaction_payload_invalid"
    runtime["network_trust_policy"].grant_allow_once.assert_not_called()
    runtime["trust_rule_repo"].upsert_rule.assert_not_called()
    runtime["secrets_controller"].set_secrets.assert_not_called()
