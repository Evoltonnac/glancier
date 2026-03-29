from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.config_loader import StepType
from core.network_trust.models import TrustDecision, TrustResolution
from core.steps.redis_step import execute_redis_step
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
async def test_execute_redis_step_returns_deterministic_envelope(
    monkeypatch: pytest.MonkeyPatch,
):
    import core.steps.redis_step as redis_step_module

    def _fake_run_redis_command(*, args, timeout_seconds, max_rows):
        assert args["command"] == "mget"
        assert timeout_seconds == 30
        assert max_rows == 500
        return {
            "rows": [{"key": "alpha", "value": "1"}, {"key": "beta", "value": "2"}],
            "fields": [{"name": "key", "type": "string"}, {"name": "value", "type": "string"}],
            "truncated": False,
            "command": "mget",
        }

    monkeypatch.setattr(redis_step_module, "_run_redis_command", _fake_run_redis_command)

    step = build_step(step_id="redis-step", use=StepType.REDIS)
    source = build_source_config(source_id="redis-source", flow=[step])
    result = await execute_redis_step(
        step,
        source,
        {
            "uri": "redis://localhost:6379/0",
            "command": "mget",
            "keys": ["alpha", "beta"],
        },
        {},
        {},
        _allow_trust_executor(),
    )

    response = result["redis_response"]
    assert response["rows"] == [{"key": "alpha", "value": "1"}, {"key": "beta", "value": "2"}]
    assert response["fields"] == [{"name": "key", "type": "string"}, {"name": "value", "type": "string"}]
    assert response["row_count"] == 2
    assert response["truncated"] is False
    assert response["command"] == "mget"
    assert response["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_execute_redis_step_private_uri_requires_network_trust_first():
    step = build_step(step_id="redis-step", use=StepType.REDIS)
    source = build_source_config(source_id="redis-trust-gate", flow=[step])
    executor = SimpleNamespace(
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.PROMPT,
                reason="default",
            )
        )
    )

    with pytest.raises(Exception) as exc_info:
        await execute_redis_step(
            step,
            source,
            {
                "uri": "redis://localhost:6379/0",
                "command": "get",
                "key": "alpha",
            },
            {},
            {},
            executor,
        )

    error = exc_info.value
    assert getattr(error, "code", None) == "runtime.network_trust_required"
    assert getattr(error, "data", {}).get("confirm_kind") == "network_trust"
    assert getattr(error, "data", {}).get("capability") == "redis"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error_message", "expected_code"),
    [
        ("Error connecting to Redis: connection refused", "runtime.redis_connect_failed"),
        ("WRONGPASS invalid username-password pair", "runtime.redis_auth_failed"),
        ("ERR value is not an integer", "runtime.redis_query_failed"),
    ],
)
async def test_execute_redis_step_maps_runtime_errors_to_stable_codes(
    monkeypatch: pytest.MonkeyPatch,
    error_message: str,
    expected_code: str,
):
    import core.steps.redis_step as redis_step_module

    def _raise_runtime_error(**_kwargs):
        raise RuntimeError(error_message)

    monkeypatch.setattr(redis_step_module, "_run_redis_command", _raise_runtime_error)

    step = build_step(step_id="redis-step", use=StepType.REDIS)
    source = build_source_config(source_id="redis-source-error", flow=[step])

    with pytest.raises(Exception) as exc_info:
        await execute_redis_step(
            step,
            source,
            {
                "uri": "redis://localhost:6379/0",
                "command": "get",
                "key": "alpha",
            },
            {},
            {},
            _allow_trust_executor(),
        )

    assert getattr(exc_info.value, "code", None) == expected_code


@pytest.mark.asyncio
async def test_executor_wires_redis_step_outputs(executor, data_controller, monkeypatch: pytest.MonkeyPatch):
    source = build_source_config(
        source_id="redis-executor-success",
        flow=[
            build_step(
                step_id="redis-step",
                use=StepType.REDIS,
                args={
                    "uri": "redis://localhost:6379/0",
                    "command": "get",
                    "key": "alpha",
                },
                outputs={"redis_rows": "redis_response.rows"},
            )
        ],
    )

    import core.steps as steps_module

    async def _fake_execute(step, source, args, context, outputs, executor):
        _ = (step, source, args, context, outputs, executor)
        return {
            "redis_response": {
                "rows": [{"key": "alpha", "value": "1"}],
                "fields": [{"name": "key", "type": "string"}, {"name": "value", "type": "string"}],
                "row_count": 1,
                "duration_ms": 0,
                "truncated": False,
                "command": "get",
                "timeout_seconds": 30,
                "max_rows": 500,
            }
        }

    monkeypatch.setattr(steps_module, "execute_redis_step", _fake_execute)
    await executor.fetch_source(source)

    data_controller.upsert.assert_called_once_with(source.id, {"redis_rows": [{"key": "alpha", "value": "1"}]})
