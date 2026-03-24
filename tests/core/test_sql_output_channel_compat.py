from __future__ import annotations

import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from core.config_loader import SourceConfig, StepConfig, StepType
from core.network_trust.models import TrustDecision, TrustResolution


def _seed_sqlite_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE metrics (id INTEGER PRIMARY KEY, value TEXT)")
        conn.execute("INSERT INTO metrics (value) VALUES ('alpha')")
        conn.execute("INSERT INTO metrics (value) VALUES ('beta')")
        conn.commit()


@pytest.mark.asyncio
async def test_sql_outputs_mapping_reads_canonical_sql_response_paths(
    executor,
    data_controller,
    tmp_path: Path,
):
    db_path = tmp_path / "metrics-canonical.db"
    _seed_sqlite_db(db_path)

    executor._network_trust_policy = SimpleNamespace(
        evaluate=lambda **_kwargs: TrustResolution(
            decision=TrustDecision.ALLOW,
            reason="source_rule",
        )
    )
    source = SourceConfig(
        id="sql-canonical-output-mapping",
        name="SQL Canonical Output Mapping",
        flow=[
            StepConfig(
                id="sql-step",
                use=StepType.SQL,
                args={
                    "connector": {"profile": "sqlite"},
                    "credentials": {"database": str(db_path)},
                    "query": "SELECT id, value FROM metrics ORDER BY id",
                },
                outputs={
                    "sql_rows": "sql_response.rows",
                    "sql_fields": "sql_response.fields",
                    "sql_duration_ms": "sql_response.duration_ms",
                },
            )
        ],
    )

    await executor.fetch_source(source)

    data_controller.upsert.assert_called_once()
    _, persisted = data_controller.upsert.call_args.args
    assert persisted["sql_rows"] == [
        {"id": 1, "value": "alpha"},
        {"id": 2, "value": "beta"},
    ]
    assert persisted["sql_fields"] == [
        {"name": "id", "type": "integer"},
        {"name": "value", "type": "string"},
    ]
    assert persisted["sql_duration_ms"] >= 0


@pytest.mark.asyncio
async def test_sql_context_mapping_keeps_alias_paths_readable_for_downstream_steps(
    executor,
    data_controller,
    tmp_path: Path,
):
    db_path = tmp_path / "metrics-alias.db"
    _seed_sqlite_db(db_path)

    executor._network_trust_policy = SimpleNamespace(
        evaluate=lambda **_kwargs: TrustResolution(
            decision=TrustDecision.ALLOW,
            reason="source_rule",
        )
    )
    source = SourceConfig(
        id="sql-alias-context-mapping",
        name="SQL Alias Context Mapping",
        flow=[
            StepConfig(
                id="sql-step",
                use=StepType.SQL,
                args={
                    "connector": {"profile": "sqlite"},
                    "credentials": {"database": str(db_path)},
                    "query": "SELECT id, value FROM metrics ORDER BY id",
                },
                outputs={
                    "sql_duration_ms": "sql_response.duration_ms",
                },
                context={
                    "sql_columns": "sql_response.columns",
                    "sql_execution_ms": "sql_response.execution_ms",
                },
            ),
            StepConfig(
                id="script-step",
                use=StepType.SCRIPT,
                args={
                    "code": (
                        "normalized = {"
                        "'columns': sql_columns, "
                        "'execution_ms': sql_execution_ms, "
                        "'duration_ms': sql_duration_ms, "
                        "'duration_matches_alias': sql_execution_ms == sql_duration_ms"
                        "}"
                    )
                },
                outputs={
                    "sql_columns": "normalized.columns",
                    "sql_execution_ms": "normalized.execution_ms",
                    "sql_duration_ms": "normalized.duration_ms",
                    "sql_alias_duration_matches": "normalized.duration_matches_alias",
                },
            ),
        ],
    )

    await executor.fetch_source(source)

    data_controller.upsert.assert_called_once()
    _, persisted = data_controller.upsert.call_args.args
    assert persisted["sql_columns"] == ["id", "value"]
    assert persisted["sql_execution_ms"] == persisted["sql_duration_ms"]
    assert persisted["sql_alias_duration_matches"] is True
