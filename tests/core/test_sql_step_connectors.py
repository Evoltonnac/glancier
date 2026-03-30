from __future__ import annotations

import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from core.config_loader import StepType
from core.network_trust.models import TrustDecision, TrustResolution
from core.steps.sql_step import execute_sql_step
from tests.factories import build_source_config, build_step


def _seed_sqlite_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE metrics (id INTEGER PRIMARY KEY, value TEXT)")
        conn.execute("INSERT INTO metrics (value) VALUES ('alpha')")
        conn.execute("INSERT INTO metrics (value) VALUES ('beta')")
        conn.commit()


def _build_allow_executor() -> SimpleNamespace:
    return SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
            )
        )
    )


@pytest.mark.asyncio
async def test_sqlite_profile_returns_fields_and_duration_ms(tmp_path: Path):
    db_path = tmp_path / "sqlite-profile.db"
    _seed_sqlite_db(db_path)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="sqlite-profile", flow=[step])

    result = await execute_sql_step(
        step,
        source,
        {
            "connector": {"profile": "sqlite"},
            "dsn": str(db_path),
            "query": "SELECT id, value FROM metrics ORDER BY id",
        },
        {},
        {},
        _build_allow_executor(),
    )

    sql_response = result["sql_response"]
    assert sql_response["fields"] == [
        {"name": "id", "type": "integer"},
        {"name": "value", "type": "string"},
    ]
    assert sql_response["duration_ms"] >= 0
    assert sql_response["truncated"] is False


@pytest.mark.asyncio
async def test_postgresql_profile_uses_adapter_and_returns_canonical_envelope(
    monkeypatch: pytest.MonkeyPatch,
):
    import core.steps.sql_step as sql_step_module

    def _fake_run_sql_query_for_profile(
        profile: str,
        *,
        dsn: str,
        query_text: str,
        max_rows: int,
    ) -> dict[str, object]:
        assert profile == "postgresql"
        assert dsn == "postgresql://demo:secret@localhost:5432/demo"
        assert query_text == "SELECT id, value FROM metrics ORDER BY id"
        assert max_rows == 500
        return {
            "columns": ["id", "value"],
            "rows": [{"id": 1, "value": "alpha"}],
            "has_more_rows": False,
            "db_type_hints": {"id": "integer", "value": "text"},
        }

    monkeypatch.setattr(sql_step_module, "run_sql_query_for_profile", _fake_run_sql_query_for_profile)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="postgres-profile", flow=[step])

    result = await execute_sql_step(
        step,
        source,
        {
            "connector": {"profile": "postgresql"},
            "dsn": "postgresql://demo:secret@localhost:5432/demo",
            "query": "SELECT id, value FROM metrics ORDER BY id",
        },
        {},
        {},
        _build_allow_executor(),
    )

    sql_response = result["sql_response"]
    assert sql_response["fields"] == [
        {"name": "id", "type": "integer"},
        {"name": "value", "type": "string"},
    ]
    assert sql_response["duration_ms"] >= 0
    assert sql_response["execution_ms"] == sql_response["duration_ms"]
    assert sql_response["truncated"] is False
    assert sql_response["statement_types"] == ["select"]


@pytest.mark.asyncio
async def test_mysql_profile_uses_adapter_and_returns_canonical_envelope(
    monkeypatch: pytest.MonkeyPatch,
):
    import core.steps.sql_step as sql_step_module

    def _fake_run_sql_query_for_profile(
        profile: str,
        *,
        dsn: str,
        query_text: str,
        max_rows: int,
    ) -> dict[str, object]:
        assert profile == "mysql"
        assert dsn == "mysql://demo:secret@127.0.0.1:3306/demo"
        assert query_text == "SELECT id, value FROM metrics ORDER BY id"
        assert max_rows == 500
        return {
            "columns": ["id", "value"],
            "rows": [{"id": 1, "value": "alpha"}],
            "has_more_rows": False,
            "db_type_hints": {"id": "long", "value": "var_string"},
        }

    monkeypatch.setattr(sql_step_module, "run_sql_query_for_profile", _fake_run_sql_query_for_profile)

    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="mysql-profile", flow=[step])

    result = await execute_sql_step(
        step,
        source,
        {
            "connector": {"profile": "mysql"},
            "dsn": "mysql://demo:secret@127.0.0.1:3306/demo",
            "query": "SELECT id, value FROM metrics ORDER BY id",
        },
        {},
        {},
        _build_allow_executor(),
    )

    sql_response = result["sql_response"]
    assert sql_response["fields"] == [
        {"name": "id", "type": "integer"},
        {"name": "value", "type": "string"},
    ]
    assert sql_response["duration_ms"] >= 0
    assert sql_response["execution_ms"] == sql_response["duration_ms"]
    assert sql_response["truncated"] is False
    assert sql_response["statement_types"] == ["select"]


@pytest.mark.asyncio
async def test_unsupported_connector_profile_fails_with_runtime_sql_connect_failed():
    step = build_step(step_id="sql-step", use=StepType.SQL)
    source = build_source_config(source_id="unsupported-profile", flow=[step])

    with pytest.raises(Exception) as exc_info:
        await execute_sql_step(
            step,
            source,
            {
                "connector": {"profile": "mongodb"},
                "dsn": ":memory:",
                "query": "SELECT 1",
            },
            {},
            {},
            _build_allow_executor(),
        )

    error = exc_info.value
    assert getattr(error, "code", None) == "runtime.sql_connect_failed"
    assert "Unsupported SQL connector profile: mongodb" in str(getattr(error, "details", ""))
