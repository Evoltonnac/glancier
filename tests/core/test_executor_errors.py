from __future__ import annotations

import sqlite3

import pytest

from core.config_loader import StepType
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
async def test_script_stdout_and_stderr_are_captured_in_error_details(executor, data_controller):
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
    runtime_messages = [
        call.kwargs.get("message") or ""
        for call in data_controller.set_state.call_args_list
        if call.kwargs.get("status") == SourceStatus.ACTIVE.value
    ]

    assert state.status == SourceStatus.ERROR
    assert state.message is not None
    assert "script exploded" in state.message
    assert any("line-from-stdout" in message for message in runtime_messages)
    assert any("line-from-stderr" in message for message in runtime_messages)


@pytest.mark.asyncio
async def test_oauth_step_blocks_curl_until_authorized(executor, data_controller):
    source = build_source_config(
        source_id="flow-auth-step-gate",
        name="Auth Step Gate Source",
        flow=[
            build_step(
                step_id="oauth-step",
                use=StepType.OAUTH,
            ),
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
    assert state.message == "auth.authorization_required"
    # Should not have started curl step yet
    assert "curl-step" not in (state.message or "")
    data_controller.upsert.assert_not_called()


@pytest.mark.asyncio
async def test_sql_query_failure_uses_runtime_sql_query_failed_error_code(
    executor,
    data_controller,
    tmp_path,
):
    db_path = tmp_path / "executor-sql-failure.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE metrics (id INTEGER PRIMARY KEY, value TEXT)")
        conn.commit()

    source = build_source_config(
        source_id="sql-query-failure",
        name="SQL Query Failure Source",
        flow=[
            build_step(
                step_id="sql",
                use=StepType.SQL,
                args={
                    "connector": {"profile": "sqlite"},
                    "dsn": str(db_path),
                    "query": "SELECT * FROM missing_table",
                },
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    error_calls = [
        call.kwargs
        for call in data_controller.set_state.call_args_list
        if call.kwargs.get("status") == SourceStatus.ERROR.value
    ]
    assert error_calls
    assert error_calls[-1]["error_code"] == "runtime.sql_query_failed"
