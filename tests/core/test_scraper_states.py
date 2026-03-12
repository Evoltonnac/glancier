from __future__ import annotations

import pytest

from core.config_loader import StepType
from core.executor import InvalidCredentialsError
from core.source_state import InteractionType, SourceStatus
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_webscraper_403_or_captcha_maps_to_suspended(executor, monkeypatch):
    source = build_source_config(
        source_id="webscraper-blocked",
        name="WebScraper Blocked Source",
        flow=[
            build_step(
                step_id="webview",
                use=StepType.WEBVIEW,
                args={
                    "url": "https://example.com/login",
                    "intercept_api": "/dashboard",
                    "script": "",
                },
            )
        ],
    )

    async def raise_blocked_error(_source):
        raise RuntimeError("403 forbidden: captcha challenge required")

    monkeypatch.setattr(executor, "_run_flow", raise_blocked_error)

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.WEBVIEW_SCRAPE
    assert state.interaction.data is not None
    assert state.interaction.data["force_foreground"] is True
    assert state.interaction.data["manual_only"] is True


@pytest.mark.asyncio
async def test_invalid_credentials_maps_to_error_with_reentry_interaction(
    executor,
    monkeypatch,
):
    source = build_source_config(
        source_id="invalid-creds",
        name="Invalid Credentials Source",
        flow=[
            build_step(
                step_id="auth",
                use=StepType.API_KEY,
                args={"label": "API Key"},
                secrets={"api_key": "api_key"},
            )
        ],
    )

    async def raise_invalid_credentials(_source):
        raise InvalidCredentialsError(
            source_id=source.id,
            step_id="fetch",
            message="401 unauthorized",
            status_code=401,
        )

    monkeypatch.setattr(executor, "_run_flow", raise_invalid_credentials)

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.INPUT_TEXT
    assert state.interaction.fields
    assert state.interaction.fields[0].key == "api_key"


@pytest.mark.asyncio
async def test_invalid_credentials_rolls_back_to_nearest_upstream_auth_step(
    executor,
    monkeypatch,
):
    source = build_source_config(
        source_id="invalid-creds-nearest",
        name="Invalid Credentials Nearest Source",
        flow=[
            build_step(
                step_id="first_auth",
                use=StepType.API_KEY,
                args={"label": "First API Key"},
                secrets={"first_api_key": "api_key"},
            ),
            build_step(
                step_id="oauth_reauth",
                use=StepType.OAUTH,
                args={"oauth_flow": "code", "doc_url": "https://docs.example.com/oauth"},
                secrets={"oauth_reauth_token": "access_token"},
            ),
            build_step(
                step_id="fetch_after_oauth",
                use=StepType.HTTP,
                args={"url": "https://example.com/data"},
            ),
        ],
    )

    async def raise_invalid_credentials(_source):
        raise InvalidCredentialsError(
            source_id=source.id,
            step_id="fetch_after_oauth",
            message="401 unauthorized",
            status_code=401,
        )

    monkeypatch.setattr(executor, "_run_flow", raise_invalid_credentials)

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.OAUTH_START
    assert state.interaction.step_id == "oauth_reauth"
    assert state.interaction.data is not None
    assert state.interaction.data["failed_step_id"] == "fetch_after_oauth"
    assert state.interaction.data["recovery_step_id"] == "oauth_reauth"


@pytest.mark.asyncio
async def test_oauth_invalid_credentials_keeps_oauth_secrets_when_refresh_fails(
    executor,
    monkeypatch,
):
    source = build_source_config(
        source_id="invalid-creds-oauth-clear",
        name="Invalid Credentials OAuth Clear Source",
        flow=[
            build_step(
                step_id="oauth_auth",
                use=StepType.OAUTH,
                args={"oauth_flow": "code"},
                secrets={"custom_oauth_token": "access_token", "oauth_secrets": "oauth_secrets"},
            ),
            build_step(
                step_id="fetch_data",
                use=StepType.HTTP,
                args={"url": "https://example.com/data"},
            ),
        ],
    )

    executor._secrets.set_secret(
        source.id,
        "access_token",
        {"access_token": "stale-token", "refresh_token": "stale-refresh"},
    )
    executor._secrets.set_secret(source.id, "custom_oauth_token", "stale-token")
    executor._secrets.set_secret(
        source.id,
        "oauth_secrets",
        {"access_token": "stale-token", "refresh_token": "stale-refresh"},
    )
    executor._secrets.set_secret(source.id, "oauth_pkce", {"verifier": "v"})
    executor._secrets.set_secret(source.id, "oauth_device", {"device_code": "d"})
    executor._secrets.set_secret(source.id, "oauth_device_status", {"status": "pending"})

    async def raise_invalid_credentials(_source):
        raise InvalidCredentialsError(
            source_id=source.id,
            step_id="fetch_data",
            message="403 forbidden",
            status_code=403,
        )

    monkeypatch.setattr(executor, "_run_flow", raise_invalid_credentials)

    async def fail_refresh(_source, _error):
        return False

    monkeypatch.setattr(executor, "_try_refresh_oauth_recovery", fail_refresh)

    await executor.fetch_source(source)

    assert executor._secrets.get_secret(source.id, "access_token") is not None
    assert executor._secrets.get_secret(source.id, "custom_oauth_token") is not None
    assert executor._secrets.get_secret(source.id, "oauth_secrets") is not None
    assert executor._secrets.get_secret(source.id, "oauth_pkce") is not None
    assert executor._secrets.get_secret(source.id, "oauth_device") is not None
    assert executor._secrets.get_secret(source.id, "oauth_device_status") is not None
    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.OAUTH_START


@pytest.mark.asyncio
async def test_oauth_invalid_credentials_refresh_success_retries_without_interaction(
    executor,
    data_controller,
    monkeypatch,
):
    source = build_source_config(
        source_id="invalid-creds-oauth-refresh-success",
        name="Invalid Credentials OAuth Refresh Success Source",
        flow=[
            build_step(
                step_id="oauth_auth",
                use=StepType.OAUTH,
                args={"oauth_flow": "code"},
                secrets={"oauth_secrets": "oauth_secrets"},
            ),
            build_step(
                step_id="fetch_data",
                use=StepType.HTTP,
                args={"url": "https://example.com/data"},
            ),
        ],
    )

    calls = {"count": 0}

    async def run_flow_once_fail_then_success(_source):
        calls["count"] += 1
        if calls["count"] == 1:
            raise InvalidCredentialsError(
                source_id=source.id,
                step_id="fetch_data",
                message="401 unauthorized",
                status_code=401,
            )
        return {"result": "ok"}

    async def succeed_refresh(_source, _error):
        return True

    monkeypatch.setattr(executor, "_run_flow", run_flow_once_fail_then_success)
    monkeypatch.setattr(executor, "_try_refresh_oauth_recovery", succeed_refresh)

    await executor.fetch_source(source)

    assert calls["count"] == 2
    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ACTIVE
    assert state.interaction is None
    data_controller.upsert.assert_called_once_with(source.id, {"result": "ok"})

@pytest.mark.asyncio
async def test_missing_config_maps_to_suspended(executor):
    source = build_source_config(
        source_id="missing-config",
        name="Missing Config Source",
        flow=[
            build_step(
                step_id="auth",
                use=StepType.API_KEY,
                args={"label": "API Key"},
                secrets={"api_key": "api_key"},
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.INPUT_TEXT
