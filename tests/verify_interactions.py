import pytest

from core.config_loader import StepType
from core.source_state import InteractionType, SourceStatus
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_api_key_interaction(executor):
    source = build_source_config(
        source_id="test-source-apikey",
        name="API Key Source",
        flow=[build_step(step_id="api-key", use=StepType.API_KEY)],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.INPUT_TEXT
    assert state.interaction.source_id == source.id


@pytest.mark.asyncio
async def test_oauth_interaction(executor):
    source = build_source_config(
        source_id="test-source-oauth",
        name="OAuth Source",
        flow=[build_step(step_id="oauth", use=StepType.OAUTH)],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.OAUTH_START
    assert state.interaction.source_id == source.id
