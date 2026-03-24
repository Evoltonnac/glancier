from __future__ import annotations

import time
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
    assert sql_response["fields"] == [
        {"name": "id", "type": "integer"},
        {"name": "value", "type": "string"},
    ]
    assert sql_response["row_count"] == 2
    assert sql_response["statement_types"] == ["select"]
    assert sql_response["risk_reasons"] == []
    assert sql_response["duration_ms"] >= 0
    assert isinstance(sql_response["truncated"], bool)
    assert sql_response["execution_ms"] == sql_response["duration_ms"]


@pytest.mark.asyncio
async def test_execute_sql_step_uses_system_sql_guardrail_defaults_when_args_missing(tmp_path: Path):
    db_path = tmp_path / "metrics-defaults.db"
    _seed_sqlite_db(db_path)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-defaults", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
            )
        ),
        _settings_manager=SimpleNamespace(
            load_settings=lambda: SimpleNamespace(
                sql_default_timeout_seconds=12,
                sql_default_max_rows=2,
            )
        ),
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
    assert sql_response["timeout_seconds"] == 12
    assert sql_response["max_rows"] == 2


@pytest.mark.asyncio
async def test_execute_sql_step_args_override_system_sql_guardrail_defaults(tmp_path: Path):
    db_path = tmp_path / "metrics-override.db"
    _seed_sqlite_db(db_path)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-overrides", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
            )
        ),
        _settings_manager=SimpleNamespace(
            load_settings=lambda: SimpleNamespace(
                sql_default_timeout_seconds=20,
                sql_default_max_rows=10,
            )
        ),
    )

    result = await execute_sql_step(
        step,
        source,
        {
            "connector": {"profile": "sqlite"},
            "credentials": {"database": str(db_path)},
            "query": "SELECT id, value FROM metrics ORDER BY id",
            "timeout": 3,
            "max_rows": 2,
        },
        {},
        {},
        executor,
    )

    sql_response = result["sql_response"]
    assert sql_response["timeout_seconds"] == 3
    assert sql_response["max_rows"] == 2


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


@pytest.mark.asyncio
async def test_execute_sql_step_timeout_maps_to_runtime_sql_timeout(
    monkeypatch: pytest.MonkeyPatch,
):
    class _SlowCursor:
        description = [("value",)]

        def fetchmany(self, _size):
            return [(1,)]

    class _SlowConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            _ = (exc_type, exc, tb)
            return False

        def execute(self, _query: str):
            time.sleep(0.2)
            return _SlowCursor()

        def commit(self):
            return None

        def close(self):
            return None

    import core.steps.sql_step as sql_step_module

    monkeypatch.setattr(sql_step_module.sqlite3, "connect", lambda *_args, **_kwargs: _SlowConnection())

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-timeout", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
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
                "query": "SELECT 1",
                "timeout": 0.001,
            },
            {},
            {},
            executor,
        )

    assert getattr(exc_info.value, "code", None) == "runtime.sql_timeout"


@pytest.mark.asyncio
async def test_execute_sql_step_max_row_limit_truncates_response(
    tmp_path: Path,
):
    db_path = tmp_path / "row-limit.db"
    _seed_sqlite_db(db_path)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-row-limit", flow=[step])
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
            "max_rows": 1,
        },
        {},
        {},
        executor,
    )

    sql_response = result["sql_response"]
    assert sql_response["row_count"] == 1
    assert sql_response["truncated"] is True
    assert sql_response["duration_ms"] >= 0
    assert sql_response["execution_ms"] == sql_response["duration_ms"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("query", "decision", "expected_code"),
    [
        ("DELETE FROM metrics", TrustDecision.DENY, "runtime.sql_risk_operation_denied"),
        ("SELECT * FROM missing_table", TrustDecision.ALLOW, "runtime.sql_query_failed"),
    ],
)
async def test_execute_sql_step_risk_denied_and_query_failures_use_stable_codes(
    tmp_path: Path,
    query: str,
    decision: TrustDecision,
    expected_code: str,
):
    db_path = tmp_path / "runtime-errors.db"
    _seed_sqlite_db(db_path)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-runtime-errors", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=decision,
                reason="source_rule",
            )
        )
    )

    with pytest.raises(Exception) as exc_info:
        await execute_sql_step(
            step,
            source,
            {
                "connector": {"profile": "sqlite"},
                "credentials": {"database": str(db_path)},
                "query": query,
            },
            {},
            {},
            executor,
        )

    assert getattr(exc_info.value, "code", None) == expected_code


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error_text", "expected_code"),
    [
        ("unable to open database file", "runtime.sql_connect_failed"),
        ("authentication failed for user demo", "runtime.sql_auth_failed"),
    ],
)
async def test_execute_sql_step_connect_and_auth_failures_use_stable_codes(
    monkeypatch: pytest.MonkeyPatch,
    error_text: str,
    expected_code: str,
):
    import core.steps.sql_step as sql_step_module

    def _raise_connect_failure(*_args, **_kwargs):
        raise sqlite3.OperationalError(error_text)

    monkeypatch.setattr(sql_step_module.sqlite3, "connect", _raise_connect_failure)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-connect-errors", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
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
                "query": "SELECT 1",
            },
            {},
            {},
            executor,
        )

    assert getattr(exc_info.value, "code", None) == expected_code


@pytest.mark.asyncio
async def test_sql_connect_error_details_redact_dsn_password_and_tokens(
    monkeypatch: pytest.MonkeyPatch,
):
    import core.steps.sql_step as sql_step_module

    def _raise_connect_failure(*_args, **_kwargs):
        raise sqlite3.OperationalError(
            "connect failed dsn=postgres://reader:super-secret@localhost:5432/db token=abc123"
        )

    monkeypatch.setattr(sql_step_module.sqlite3, "connect", _raise_connect_failure)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sql-redaction-details", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
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
                "query": "SELECT 1",
            },
            {},
            {},
            executor,
        )

    details = str(getattr(exc_info.value, "details", ""))
    assert "super-secret" not in details
    assert "abc123" not in details
    assert "[REDACTED]" in details


@pytest.mark.asyncio
async def test_executor_sql_error_state_redacts_password_fragments(
    executor,
    data_controller,
    monkeypatch: pytest.MonkeyPatch,
):
    import core.steps.sql_step as sql_step_module

    def _raise_auth_failure(*_args, **_kwargs):
        raise sqlite3.OperationalError("authentication failed password=hunter2")

    monkeypatch.setattr(sql_step_module.sqlite3, "connect", _raise_auth_failure)

    source = build_source_config(
        source_id="sql-redaction-state",
        flow=[
            build_step(
                step_id="sql-step",
                use=StepType.SQL,
                args={
                    "connector": {"profile": "sqlite"},
                    "credentials": {"database": ":memory:"},
                    "query": "SELECT 1",
                },
            )
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.message is not None
    assert "hunter2" not in state.message
    assert "[REDACTED]" in state.message

    error_calls = [
        call.kwargs
        for call in data_controller.set_state.call_args_list
        if call.kwargs.get("status") == SourceStatus.ERROR.value
    ]
    assert error_calls
    assert error_calls[-1]["error_code"] == "runtime.sql_auth_failed"
