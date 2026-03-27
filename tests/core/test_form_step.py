from __future__ import annotations

import pytest

from core.config_loader import StepType
from core.source_state import InteractionType, SourceStatus
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_form_step_requests_missing_required_fields_with_secret_keys(executor, data_controller):
    source = build_source_config(
        source_id="form-required-missing",
        name="Form Required Missing",
        flow=[
            build_step(
                step_id="collect",
                use=StepType.FORM,
                args={
                    "fields": [
                        {"key": "account_id", "label": "Account ID"},
                        {"key": "token", "label": "Token", "type": "password"},
                    ],
                    "message": "Please fill required fields",
                },
                secrets={
                    "provider_account_id": "account_id",
                    "provider_token": "token",
                },
                outputs={
                    "account_id": "account_id",
                    "token": "token",
                },
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.INPUT_FORM
    assert [field.key for field in state.interaction.fields] == [
        "provider_account_id",
        "provider_token",
    ]
    data_controller.upsert.assert_not_called()


@pytest.mark.asyncio
async def test_form_step_uses_persisted_secrets_and_maps_outputs(executor, data_controller, secrets_controller):
    source = build_source_config(
        source_id="form-secrets-present",
        name="Form Secrets Present",
        flow=[
            build_step(
                step_id="collect",
                use=StepType.FORM,
                args={
                    "fields": [
                        {"key": "account_id", "label": "Account ID"},
                        {"key": "region", "label": "Region", "default": "us"},
                    ]
                },
                secrets={
                    "provider_account_id": "account_id",
                    "provider_region": "region",
                },
                outputs={
                    "account_id": "account_id",
                    "region": "region",
                },
            )
        ],
    )
    secrets_controller.set_secrets(
        source.id,
        {
            "provider_account_id": "acc-123",
            "provider_region": "eu",
        },
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ACTIVE
    assert state.interaction is None
    data_controller.upsert.assert_called_once_with(
        source.id,
        {"account_id": "acc-123", "region": "eu"},
    )


@pytest.mark.asyncio
async def test_form_step_optional_missing_field_suspends_with_input_form(executor, data_controller):
    source = build_source_config(
        source_id="form-optional-missing",
        name="Form Optional Missing",
        flow=[
            build_step(
                step_id="collect",
                use=StepType.FORM,
                args={"fields": [{"key": "note", "label": "Note", "required": False}]},
                outputs={"note": "note"},
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.INPUT_FORM
    assert [field.key for field in state.interaction.fields] == ["note"]
    assert state.interaction.fields[0].required is False
    data_controller.upsert.assert_not_called()


@pytest.mark.asyncio
async def test_form_step_whitespace_required_field_is_treated_as_missing(
    executor,
    secrets_controller,
):
    source = build_source_config(
        source_id="form-whitespace-required",
        name="Form Whitespace Required",
        flow=[
            build_step(
                step_id="collect",
                use=StepType.FORM,
                args={"fields": [{"key": "account_id", "label": "Account ID"}]},
                secrets={"provider_account_id": "account_id"},
            )
        ],
    )
    secrets_controller.set_secret(source.id, "provider_account_id", "   ")

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.step_id == "collect"
    assert [field.key for field in state.interaction.fields] == ["provider_account_id"]
