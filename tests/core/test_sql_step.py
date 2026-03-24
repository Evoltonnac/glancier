from __future__ import annotations

import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from core.config_loader import StepType
from core.network_trust.models import TrustDecision, TrustResolution
from core.source_state import InteractionType, SourceStatus
from core.steps.sql_step import execute_sql_step
from tests.factories import build_source_config, build_step


def _seed_sqlite_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE metrics (id INTEGER PRIMARY KEY, value TEXT)")
        conn.execute("INSERT INTO metrics (value) VALUES ('alpha')")
        conn.execute("INSERT INTO metrics (value) VALUES ('beta')")
        conn.commit()


@pytest.mark.asyncio
async def test_execute_sql_step_select_returns_deterministic_envelope(tmp_path: Path):
    db_path = tmp_path / "metrics.db"
    _seed_sqlite_db(db_path)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-select", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
            )
        )
    )

    result = await execute_sql_step(
        step,
        source,
        {
            "connector": {"profile": "sqlite"},
            "credentials": {"database": str(db_path)},
            "query": "SELECT id, value FROM metrics ORDER BY id",
        },
        {},
        {},
        executor,
    )

    sql_response = result["sql_response"]
    assert sql_response["rows"] == [
        {"id": 1, "value": "alpha"},
        {"id": 2, "value": "beta"},
    ]
    assert sql_response["columns"] == ["id", "value"]
    assert sql_response["row_count"] == 2
    assert sql_response["statement_types"] == ["select"]
    assert sql_response["risk_reasons"] == []


@pytest.mark.asyncio
async def test_execute_sql_step_high_risk_query_requires_trust_before_execution(
    monkeypatch: pytest.MonkeyPatch,
):
    def _unexpected_connect(*_args, **_kwargs):
        raise AssertionError("SQL connection should not happen before trust confirmation")

    import core.steps.sql_step as sql_step_module

    monkeypatch.setattr(sql_step_module.sqlite3, "connect", _unexpected_connect)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-trust-gate", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.PROMPT,
                reason="default",
            )
        )
    )

    with pytest.raises(Exception) as exc_info:
        await execute_sql_step(
            step,
            source,
            {
                "connector": {"profile": "sqlite"},
                "credentials": {"database": ":memory:"},
                "query": "DELETE FROM metrics",
            },
            {},
            {},
            executor,
        )

    error = exc_info.value
    assert getattr(error, "code", None) == "runtime.sql_risk_operation_requires_trust"
    assert getattr(error, "data", {}).get("confirm_kind") == "network_trust"


@pytest.mark.asyncio
async def test_executor_wires_sql_step_and_persists_output(executor, data_controller, tmp_path: Path):
    db_path = tmp_path / "metrics.db"
    _seed_sqlite_db(db_path)

    executor._network_trust_policy = SimpleNamespace(
        evaluate=lambda **_kwargs: TrustResolution(
            decision=TrustDecision.ALLOW,
            reason="source_rule",
        )
    )
    source = build_source_config(
        source_id="sql-executor-success",
        flow=[
            build_step(
                step_id="sql-step",
                use=StepType.SQL,
                args={
                    "connector": {"profile": "sqlite"},
                    "credentials": {"database": str(db_path)},
                    "query": "SELECT id, value FROM metrics ORDER BY id",
                },
                outputs={"rows": "sql_response.rows"},
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ACTIVE
    data_controller.upsert.assert_called_once_with(
        source.id,
        {"rows": [{"id": 1, "value": "alpha"}, {"id": 2, "value": "beta"}]},
    )


@pytest.mark.asyncio
async def test_executor_sql_trust_gate_updates_suspended_state_with_sql_error_code(
    executor,
    data_controller,
):
    executor._network_trust_policy = SimpleNamespace(
        evaluate=lambda **_kwargs: TrustResolution(
            decision=TrustDecision.PROMPT,
            reason="default",
        )
    )
    source = build_source_config(
        source_id="sql-executor-trust-required",
        flow=[
            build_step(
                step_id="sql-step",
                use=StepType.SQL,
                args={
                    "connector": {"profile": "sqlite"},
                    "credentials": {"database": ":memory:"},
                    "query": "DELETE FROM metrics",
                },
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.SUSPENDED
    assert state.interaction is not None
    assert state.interaction.type == InteractionType.CONFIRM
    assert state.interaction.data is not None
    assert state.interaction.data.get("confirm_kind") == "network_trust"

    suspended_calls = [
        call.kwargs
        for call in data_controller.set_state.call_args_list
        if call.kwargs.get("status") == SourceStatus.SUSPENDED.value
    ]
    assert suspended_calls
    assert suspended_calls[-1]["error_code"] == "runtime.sql_risk_operation_requires_trust"
