from __future__ import annotations

import pytest

from core.config_loader import StepType
from core.source_state import InteractionType, SourceStatus
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("step", "expected_interaction"),
    [
        (
            build_step(step_id="apikey", use=StepType.API_KEY),
            InteractionType.INPUT_TEXT,
        ),
        (
            build_step(
                step_id="form",
                use=StepType.FORM,
                args={"fields": [{"key": "account_id", "label": "Account ID"}]},
            ),
            InteractionType.INPUT_TEXT,
        ),
        (
            build_step(step_id="oauth", use=StepType.OAUTH),
            InteractionType.OAUTH_START,
        ),
        (
            build_step(
                step_id="oauth-device",
                use=StepType.OAUTH,
                args={"oauth_flow": "device"},
            ),
            InteractionType.OAUTH_DEVICE_FLOW,
        ),
        (
            build_step(step_id="curl", use=StepType.CURL),
            InteractionType.INPUT_TEXT,
        ),
        (
            build_step(
                step_id="webview",
                use=StepType.WEBVIEW,
                args={"url": "https://example.com/auth"},
            ),
            InteractionType.WEBVIEW_SCRAPE,
        ),
    ],
)
async def test_flow_auth_steps_require_interaction(
    executor,
    step,
    expected_interaction,
):
    source = build_source_config(
        source_id=f"auth-matrix-{step.id}",
        name="Auth Matrix Source",
        flow=[step],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == expected_interaction
    assert state.interaction.source_id == source.id


@pytest.mark.asyncio
async def test_webview_interaction_exposes_required_payload(executor):
    step = build_step(
        step_id="webview",
        use=StepType.WEBVIEW,
        args={
            "url": "https://example.com/login",
            "script": "return window.location.href",
            "intercept_api": "/api/session",
        },
        secrets={"session_capture": "webview_data"},
    )
    source = build_source_config(
        source_id="auth-matrix-webview-payload",
        name="Webview Payload Source",
        flow=[step],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.WEBVIEW_SCRAPE
    assert state.interaction.data is not None
    assert state.interaction.data["url"] == "https://example.com/login"
    assert state.interaction.data["secret_key"] == "session_capture"


@pytest.mark.asyncio
async def test_required_interaction_step_id_tracks_actual_step(executor, secrets_controller):
    source = build_source_config(
        source_id="auth-step-id-transition",
        name="Auth Step Transition",
        flow=[
            build_step(step_id="api_key", use=StepType.API_KEY),
            build_step(
                step_id="form",
                use=StepType.FORM,
                args={"fields": [{"key": "account_id", "label": "Account ID"}]},
            ),
        ],
    )

    await executor.fetch_source(source)
    first_state = executor.get_source_state(source.id)
    assert first_state.status == SourceStatus.SUSPENDED
    assert first_state.interaction is not None
    assert first_state.interaction.step_id == "api_key"
    assert [field.key for field in first_state.interaction.fields] == ["api_key"]

    secrets_controller.set_secret(source.id, "api_key", "sk-test-123")
    await executor.fetch_source(source)
    second_state = executor.get_source_state(source.id)
    assert second_state.status == SourceStatus.SUSPENDED
    assert second_state.interaction is not None
    assert second_state.interaction.step_id == "form"
    assert [field.key for field in second_state.interaction.fields] == ["account_id"]


@pytest.mark.asyncio
async def test_api_key_whitespace_is_treated_as_missing(executor, secrets_controller):
    source = build_source_config(
        source_id="auth-api-key-whitespace",
        name="API Key Whitespace",
        flow=[build_step(step_id="api_key", use=StepType.API_KEY)],
    )
    secrets_controller.set_secret(source.id, "api_key", "   ")

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.step_id == "api_key"
    assert [field.key for field in state.interaction.fields] == ["api_key"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("oauth_args", "expected_interaction_type"),
    [
        ({"oauth_flow": "device", "client_id": "client-id"}, InteractionType.OAUTH_DEVICE_FLOW),
        ({"oauth_flow": "code", "client_id": "client-id", "supports_pkce": True}, InteractionType.OAUTH_START),
        ({"oauth_flow": "code", "client_id": "client-id", "supports_pkce": "false"}, InteractionType.OAUTH_START),
        ({"oauth_flow": "client_credentials", "client_id": "client-id"}, InteractionType.OAUTH_START),
        ({"response_type": "token", "client_id": "client-id", "supports_pkce": False}, InteractionType.OAUTH_START),
    ],
)
async def test_oauth_client_secret_is_optional_across_oauth_flows(
    executor,
    oauth_args,
    expected_interaction_type,
):
    flow_slug = str(oauth_args.get("oauth_flow") or oauth_args.get("response_type") or "default")
    source = build_source_config(
        source_id=f"oauth-secret-optional-{flow_slug}",
        name="OAuth Secret Requirement",
        flow=[
            build_step(
                step_id="oauth",
                use=StepType.OAUTH,
                args=oauth_args,
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == expected_interaction_type
    fields_by_key = {field.key: field for field in state.interaction.fields}
    assert "client_secret" in fields_by_key
    assert fields_by_key["client_secret"].required is False
