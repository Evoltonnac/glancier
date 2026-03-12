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
