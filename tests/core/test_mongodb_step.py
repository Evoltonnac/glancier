from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.config_loader import StepType
from core.network_trust.models import TrustDecision, TrustResolution
from core.steps.mongodb_step import execute_mongodb_step
from tests.factories import build_source_config, build_step


def _allow_trust_executor() -> SimpleNamespace:
    return SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="test_allow",
            )
        )
    )


@pytest.mark.asyncio
async def test_execute_mongodb_step_returns_deterministic_envelope(
    monkeypatch: pytest.MonkeyPatch,
):
    import core.steps.mongodb_step as mongodb_step_module

    def _fake_run_mongodb_query(*, args, timeout_seconds, max_rows):
        assert args["operation"] == "find"
        assert timeout_seconds == 30
        assert max_rows == 500
        return {
            "rows": [{"name": "alpha", "count": 3}],
            "fields": [{"name": "name", "type": "string"}, {"name": "count", "type": "integer"}],
            "truncated": False,
            "operation": "find",
        }

    monkeypatch.setattr(mongodb_step_module, "_run_mongodb_query", _fake_run_mongodb_query)

    step = build_step(step_id="mongo-step", use=StepType.MONGODB)
    source = build_source_config(source_id="mongo-source", flow=[step])
    result = await execute_mongodb_step(
        step,
        source,
        {
            "uri": "mongodb://localhost:27017",
            "database": "demo",
            "collection": "metrics",
            "operation": "find",
            "filter": {"name": "alpha"},
        },
        {},
        {},
        _allow_trust_executor(),
    )

    response = result["mongo_response"]
    assert response["rows"] == [{"name": "alpha", "count": 3}]
    assert response["fields"] == [{"name": "name", "type": "string"}, {"name": "count", "type": "integer"}]
    assert response["row_count"] == 1
    assert response["truncated"] is False
    assert response["operation"] == "find"
    assert response["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_execute_mongodb_step_private_uri_requires_network_trust_first():
    step = build_step(step_id="mongo-step", use=StepType.MONGODB)
    source = build_source_config(source_id="mongo-trust-gate", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.PROMPT,
                reason="default",
            )
        )
    )

    with pytest.raises(Exception) as exc_info:
        await execute_mongodb_step(
            step,
            source,
            {
                "uri": "mongodb://localhost:27017",
                "database": "demo",
                "collection": "metrics",
                "operation": "find",
                "filter": {"name": "alpha"},
            },
            {},
            {},
            executor,
        )

    error = exc_info.value
    assert getattr(error, "code", None) == "runtime.network_trust_required"
    assert getattr(error, "data", {}).get("confirm_kind") == "network_trust"
    assert getattr(error, "data", {}).get("capability") == "mongodb"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error_message", "expected_code"),
    [
        ("ServerSelectionTimeoutError: timed out", "runtime.mongo_connect_failed"),
        ("Authentication failed for user", "runtime.mongo_auth_failed"),
        ("pipeline stage is invalid", "runtime.mongo_query_failed"),
    ],
)
async def test_execute_mongodb_step_maps_runtime_errors_to_stable_codes(
    monkeypatch: pytest.MonkeyPatch,
    error_message: str,
    expected_code: str,
):
    import core.steps.mongodb_step as mongodb_step_module

    def _raise_runtime_error(**_kwargs):
        raise RuntimeError(error_message)

    monkeypatch.setattr(mongodb_step_module, "_run_mongodb_query", _raise_runtime_error)

    step = build_step(step_id="mongo-step", use=StepType.MONGODB)
    source = build_source_config(source_id="mongo-source-error", flow=[step])

    with pytest.raises(Exception) as exc_info:
        await execute_mongodb_step(
            step,
            source,
            {
                "uri": "mongodb://localhost:27017",
                "database": "demo",
                "collection": "metrics",
                "operation": "find",
                "filter": {"name": "alpha"},
            },
            {},
            {},
            _allow_trust_executor(),
        )

    assert getattr(exc_info.value, "code", None) == expected_code


@pytest.mark.asyncio
async def test_executor_wires_mongodb_step_outputs(executor, data_controller, monkeypatch: pytest.MonkeyPatch):
    source = build_source_config(
        source_id="mongo-executor-success",
        flow=[
            build_step(
                step_id="mongo-step",
                use=StepType.MONGODB,
                args={
                    "uri": "mongodb://localhost:27017",
                    "database": "demo",
                    "collection": "metrics",
                    "operation": "find",
                    "filter": {},
                },
                outputs={"mongo_rows": "mongo_response.rows"},
            )
        ],
    )

    import core.steps as steps_module

    async def _fake_execute(step, source, args, context, outputs, executor):
        _ = (step, source, args, context, outputs, executor)
        return {
            "mongo_response": {
                "rows": [{"name": "alpha"}],
                "fields": [{"name": "name", "type": "string"}],
                "row_count": 1,
                "duration_ms": 0,
                "truncated": False,
                "operation": "find",
                "timeout_seconds": 30,
                "max_rows": 500,
            }
        }

    monkeypatch.setattr(steps_module, "execute_mongodb_step", _fake_execute)
    await executor.fetch_source(source)

    data_controller.upsert.assert_called_once_with(source.id, {"mongo_rows": [{"name": "alpha"}]})
