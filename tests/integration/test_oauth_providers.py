from __future__ import annotations

import pytest
import httpx

from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.integrations.base_client.errors import OAuthError

from core.auth.oauth_auth import OAuthAuth
from core.config_loader import AuthConfig, AuthType


def _build_code_config(**overrides) -> AuthConfig:
    payload = {
        "type": AuthType.OAUTH,
        "oauth_flow": "code",
        "auth_url": "https://provider.example.com/oauth/authorize",
        "token_url": "https://provider.example.com/oauth/token",
        "client_id": "client-id",
        "client_secret": "client-secret",
        "supports_pkce": True,
    }
    payload.update(overrides)
    return AuthConfig(**payload)


def _build_device_config(**overrides) -> AuthConfig:
    payload = {
        "type": AuthType.OAUTH,
        "oauth_flow": "device",
        "token_url": "https://provider.example.com/oauth/token",
        "device_authorization_url": "https://provider.example.com/oauth/device",
        "client_id": "client-id",
        "client_secret": "client-secret",
        "token_endpoint_auth_method": "client_secret_post",
    }
    payload.update(overrides)
    return AuthConfig(**payload)


@pytest.mark.asyncio
async def test_code_flow_mock_provider_persists_token(secrets_controller, monkeypatch, httpx_mock):
    captured: dict[str, str | None] = {}

    def fake_create_authorization_url(self, url, state=None, code_verifier=None, **kwargs):
        _ = self
        _ = kwargs
        assert url == "https://provider.example.com/oauth/authorize"
        captured["state"] = state
        assert isinstance(code_verifier, str)
        return (f"https://provider.example.com/oauth/authorize?state={state}", state)

    monkeypatch.setattr(
        AsyncOAuth2Client,
        "create_authorization_url",
        fake_create_authorization_url,
    )

    handler = OAuthAuth(_build_code_config(), "source-code", secrets_controller)
    authorize_url = handler.get_authorize_url("http://localhost:5173/oauth/callback")
    stored_state = secrets_controller.get_secrets("source-code")["oauth_pkce"]["state"]
    assert captured["state"] == stored_state
    assert f"state={stored_state}" in authorize_url

    httpx_mock.add_response(
        method="POST",
        url="https://provider.example.com/oauth/token",
        json={
            "access_token": "token-1",
            "refresh_token": "refresh-1",
            "token_type": "Bearer",
            "expires_in": 3600,
        },
    )
    await handler.exchange_code(
        "auth-code",
        "http://localhost:5173/oauth/callback",
        state=stored_state,
    )

    stored = secrets_controller.get_secrets("source-code")["oauth_secrets"]
    assert stored["access_token"] == "token-1"
    assert stored["refresh_token"] == "refresh-1"
    assert stored["token_type"] == "Bearer"


@pytest.mark.asyncio
async def test_code_flow_invalid_code_raises(secrets_controller, monkeypatch, httpx_mock):
    def fake_create_authorization_url(self, url, state=None, code_verifier=None, **kwargs):
        _ = self
        _ = kwargs
        return (f"https://provider.example.com/oauth/authorize?state={state}", state)

    monkeypatch.setattr(AsyncOAuth2Client, "create_authorization_url", fake_create_authorization_url)

    handler = OAuthAuth(_build_code_config(), "source-code", secrets_controller)
    handler.get_authorize_url("http://localhost:5173/oauth/callback")
    stored_state = secrets_controller.get_secrets("source-code")["oauth_pkce"]["state"]

    httpx_mock.add_response(
        method="POST",
        url="https://provider.example.com/oauth/token",
        status_code=400,
        json={"error": "invalid_grant", "error_description": "bad code"},
    )

    with pytest.raises(OAuthError):
        await handler.exchange_code(
            "bad-code",
            "http://localhost:5173/oauth/callback",
            state=stored_state,
        )


@pytest.mark.asyncio
async def test_device_flow_mock_provider_pending_slowdown_then_success(
    secrets_controller,
    httpx_mock,
):
    handler = OAuthAuth(_build_device_config(), "source-device", secrets_controller)

    httpx_mock.add_response(
        method="POST",
        url="https://provider.example.com/oauth/device",
        json={
            "device_code": "dev-code-1",
            "user_code": "CODE-123",
            "verification_uri": "https://provider.example.com/activate",
            "expires_in": 1200,
            "interval": 2,
        },
    )

    start_payload = await handler.start_device_flow()
    assert start_payload["device_code"] == "dev-code-1"

    httpx_mock.add_response(
        method="POST",
        url="https://provider.example.com/oauth/token",
        status_code=400,
        json={"error": "authorization_pending"},
    )
    httpx_mock.add_response(
        method="POST",
        url="https://provider.example.com/oauth/token",
        status_code=400,
        json={"error": "slow_down"},
    )
    httpx_mock.add_response(
        method="POST",
        url="https://provider.example.com/oauth/token",
        json={
            "access_token": "device-token",
            "refresh_token": "device-refresh",
            "token_type": "Bearer",
            "expires_in": 3600,
        },
    )

    first = await handler.poll_device_token()
    second = await handler.poll_device_token()
    third = await handler.poll_device_token()

    assert first == {"status": "pending", "retry_after": 2}
    assert second == {"status": "pending", "retry_after": 7}
    assert third == {"status": "authorized"}
    stored = secrets_controller.get_secrets("source-device")["oauth_secrets"]
    assert stored["access_token"] == "device-token"
