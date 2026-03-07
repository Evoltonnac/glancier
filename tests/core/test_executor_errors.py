from __future__ import annotations

import pytest

from core.config_loader import AuthType, StepType
from core.source_state import InteractionType, SourceStatus
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_flow_stops_immediately_when_step_raises(executor, data_controller):
    source = build_source_config(
        source_id="flow-fail-fast",
        name="Fail Fast Source",
        flow=[
            build_step(
                step_id="first",
                use=StepType.SCRIPT,
                args={"code": "raise RuntimeError('boom-first')"},
            ),
            build_step(
                step_id="second",
                use=StepType.SCRIPT,
                args={"code": "raise RuntimeError('boom-second')"},
            ),
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.message is not None
    assert "boom-first" in state.message
    assert "boom-second" not in state.message
    data_controller.upsert.assert_not_called()


@pytest.mark.asyncio
async def test_script_stdout_and_stderr_are_captured_in_error_details(executor):
    source = build_source_config(
        source_id="flow-stream-capture",
        name="Stream Capture Source",
        flow=[
            build_step(
                step_id="script",
                use=StepType.SCRIPT,
                args={
                    "code": (
                        "import sys\n"
                        "print('line-from-stdout')\n"
                        "print('line-from-stderr', file=sys.stderr)\n"
                        "raise RuntimeError('script exploded')\n"
                    )
                },
            ),
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.message is not None
    assert "line-from-stdout" in state.message
    assert "line-from-stderr" in state.message
    assert "script exploded" in state.message


@pytest.mark.asyncio
async def test_oauth_gate_blocks_curl_before_step_runs(executor, data_controller):
    source = build_source_config(
        source_id="flow-auth-gate",
        name="Auth Gate Source",
        auth_type=AuthType.OAUTH,
        flow=[
            build_step(
                step_id="curl-step",
                use=StepType.CURL,
                args={"message": "should not reach curl command check first"},
            ),
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.OAUTH_START
    assert "Authorization required" in (state.message or "")
    assert "curl-step" not in (state.message or "")
    data_controller.upsert.assert_not_called()
