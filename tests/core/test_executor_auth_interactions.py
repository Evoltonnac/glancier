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
async def test_form_interaction_keeps_optional_missing_fields_and_metadata(executor):
    source = build_source_config(
        source_id="auth-form-optional-fields",
        name="Optional Form Source",
        flow=[
            build_step(
                step_id="form",
                use=StepType.FORM,
                args={
                    "message": "Fill optional form fields",
                    "fields": [
                        {
                            "key": "workspace",
                            "label": "Workspace",
                            "required": False,
                            "type": "select",
                            "options": [
                                {"label": "Alpha", "value": "alpha"},
                                {"label": "Beta", "value": "beta"},
                            ],
                            "default": "beta",
                        },
                        {
                            "key": "notifications",
                            "label": "Notifications",
                            "required": False,
                            "type": "switch",
                            "default": True,
                        },
                    ],
                },
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.step_id == "form"
    assert state.interaction.message == "Fill optional form fields"
    assert [field.key for field in state.interaction.fields] == [
        "workspace",
        "notifications",
    ]
    workspace_field = state.interaction.fields[0]
    notifications_field = state.interaction.fields[1]
    assert workspace_field.required is False
    assert workspace_field.type == "select"
    assert workspace_field.default == "beta"
    assert workspace_field.options == [
        {"label": "Alpha", "value": "alpha"},
        {"label": "Beta", "value": "beta"},
    ]
    assert notifications_field.required is False
    assert notifications_field.type == "switch"
    assert notifications_field.default is True


@pytest.mark.asyncio
async def test_form_interaction_includes_required_and_optional_missing_fields(executor):
    source = build_source_config(
        source_id="auth-form-mixed-fields",
        name="Mixed Form Source",
        flow=[
            build_step(
                step_id="form",
                use=StepType.FORM,
                args={
                    "fields": [
                        {"key": "tenant", "label": "Tenant", "required": True},
                        {
                            "key": "regions",
                            "label": "Regions",
                            "required": False,
                            "type": "multiselect",
                            "multiple": True,
                            "options": [
                                {"label": "US", "value": "us"},
                                {"label": "EU", "value": "eu"},
                            ],
                        },
                    ]
                },
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert [field.key for field in state.interaction.fields] == ["tenant", "regions"]
    assert state.interaction.fields[0].required is True
    assert state.interaction.fields[1].required is False
    assert state.interaction.fields[1].multiple is True


@pytest.mark.asyncio
async def test_form_interaction_includes_all_fields_for_large_forms(executor):
    fields = [
        {
            "key": f"field_{index}",
            "label": f"Field {index}",
            "required": False,
            "type": "text",
        }
        for index in range(1, 33)
    ]
    source = build_source_config(
        source_id="auth-form-large-fields",
        name="Large Form Source",
        flow=[
            build_step(
                step_id="form",
                use=StepType.FORM,
                args={"fields": fields},
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert len(state.interaction.fields) == 32
    assert state.interaction.fields[-1].key == "field_32"


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


@pytest.mark.asyncio
async def test_missing_credentials_interaction_persists_standard_error_code(
    executor,
    data_controller,
):
    source = build_source_config(
        source_id="auth-error-code",
        name="Auth Error Code Source",
        flow=[build_step(step_id="api_key", use=StepType.API_KEY)],
    )

    await executor.fetch_source(source)

    suspended_calls = [
        call.kwargs
        for call in data_controller.set_state.call_args_list
        if call.kwargs.get("status") == SourceStatus.SUSPENDED.value
    ]
    assert suspended_calls
    assert suspended_calls[-1]["error_code"] == "auth.missing_credentials"
    # Keep legacy behavior for suspended state: no error summary field required.
    assert suspended_calls[-1].get("error") is None


@pytest.mark.asyncio
async def test_oauth_interaction_keeps_route_bound_source_id(executor):
    source = build_source_config(
        source_id="oauth-route-bound-source",
        name="OAuth Route Bound Source",
        flow=[
            build_step(
                step_id="oauth",
                use=StepType.OAUTH,
                args={"oauth_flow": "code", "client_id": "client-id", "supports_pkce": True},
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.OAUTH_START
    assert state.interaction.source_id == source.id
