from __future__ import annotations

import pytest

from authlib.integrations.httpx_client import AsyncOAuth2Client

from core.auth.oauth_auth import OAuthAuth
from core.config_loader import AuthConfig, AuthType


def _build_auth_config(**overrides) -> AuthConfig:
    payload = {
        "type": AuthType.OAUTH,
        "auth_url": "https://provider.example.com/oauth/authorize",
        "token_url": "https://provider.example.com/oauth/token",
        "client_id": "client-id",
        "client_secret": "client-secret",
        "supports_pkce": True,
        "response_type": "code",
    }
    payload.update(overrides)
    return AuthConfig(**payload)


@pytest.mark.asyncio
async def test_start_authorization_code_flow_returns_polymorphic_payload(
    secrets_controller,
    monkeypatch,
):
    captured: dict[str, object] = {}

    def fake_create_authorization_url(self, url, state=None, code_verifier=None, **kwargs):
        captured["url"] = url
        captured["state"] = state
        captured["code_verifier"] = code_verifier
        captured["response_type"] = kwargs.get("response_type")
        captured["code_challenge_method"] = kwargs.get("code_challenge_method")
        return (f"https://provider.example.com/oauth/authorize?state={state}", state)

    monkeypatch.setattr(
        AsyncOAuth2Client,
        "create_authorization_url",
        fake_create_authorization_url,
    )

    handler = OAuthAuth(_build_auth_config(code_challenge_method="plain"), "src", secrets_controller)
    result = await handler.start_authorization("http://localhost:5173/oauth/callback")

    assert result["flow"] == "code"
    assert result["authorize_url"].startswith("https://provider.example.com/oauth/authorize")
    assert captured["url"] == "https://provider.example.com/oauth/authorize"
    assert isinstance(captured["state"], str)
    assert len(captured["state"]) >= 48
    assert isinstance(captured["code_verifier"], str)
    assert len(captured["code_verifier"]) >= 43
    assert captured["response_type"] == "code"
    assert captured["code_challenge_method"] == "plain"
    pkce_state = secrets_controller.get_secrets("src")["oauth_pkce"]
    assert pkce_state["state"] == captured["state"]
    assert pkce_state["source_id"] == "src"
    assert pkce_state["redirect_uri"] == "http://localhost:5173/oauth/callback"
    assert pkce_state["used_at"] is None


@pytest.mark.asyncio
async def test_exchange_code_uses_authlib_fetch_token_and_persists_token(
    secrets_controller,
    monkeypatch,
):
    captured: dict[str, object] = {}

    async def fake_fetch_token(self, **kwargs):
        captured.update(kwargs)
        return {
            "access_token": "new-token",
            "refresh_token": "new-refresh",
            "expires_in": 3600,
        }

    monkeypatch.setattr(AsyncOAuth2Client, "fetch_token", fake_fetch_token)

    handler = OAuthAuth(_build_auth_config(), "src", secrets_controller)
    handler._save_pkce_state("verifier-123", "server-state", "http://localhost:5173/oauth/callback")
    await handler.exchange_code(
        "auth-code",
        "http://localhost:5173/oauth/callback",
        state="server-state",
    )

    all_secrets = secrets_controller.get_secrets("src")
    stored = all_secrets["oauth_secrets"]
    assert stored["access_token"] == "new-token"
    assert stored["refresh_token"] == "new-refresh"
    assert "expires_at" in stored
    assert "access_token" not in all_secrets

    assert captured["url"] == "https://provider.example.com/oauth/token"
    assert captured["grant_type"] == "authorization_code"
    assert captured["code"] == "auth-code"
    assert captured["code_verifier"] == "verifier-123"
    assert all_secrets["oauth_pkce"]["used_at"] is not None
