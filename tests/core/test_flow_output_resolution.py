from __future__ import annotations

import pytest

from core.config_loader import StepType
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_executor_outputs_use_target_to_source_mapping(executor):
    source = build_source_config(
        source_id="output-target-source",
        flow=[
            build_step(
                step_id="prepare",
                use=StepType.SCRIPT,
                args={"code": "raw_payload = {'balance': 100}"},
                outputs={"payload": "raw_payload"},
            ),
        ],
    )

    result = await executor._run_flow(source)
    assert result["payload"] == {"balance": 100}


@pytest.mark.asyncio
async def test_extract_supports_multiple_output_mappings(executor):
    source = build_source_config(
        source_id="extract-multi-output",
        flow=[
            build_step(
                step_id="seed",
                use=StepType.SCRIPT,
                args={"code": "payload = {'billing': {'available_balance_usd': 100, 'currency': 'USD'}}"},
                outputs={"payload": "payload"},
            ),
            build_step(
                step_id="extract",
                use=StepType.EXTRACT,
                args={
                    "source": "{payload}",
                    "type": "jsonpath",
                },
                outputs={
                    "available_balance": "$.billing.available_balance_usd",
                    "currency": "$.billing.currency",
                },
            ),
        ],
    )

    result = await executor._run_flow(source)
    assert result["available_balance"] == 100
    assert result["currency"] == "USD"


@pytest.mark.asyncio
async def test_run_flow_passes_previous_outputs_to_resolver(executor, monkeypatch):
    captured_top_level_outputs: list[dict[str, object]] = []
    original_resolve_args = executor._resolve_args

    def capture_outputs(args, outputs, context, source_id):
        if isinstance(args, dict):
            captured_top_level_outputs.append(dict(outputs))
        return original_resolve_args(args, outputs, context, source_id)

    monkeypatch.setattr(executor, "_resolve_args", capture_outputs)

    source = build_source_config(
        source_id="resolver-outputs-priority",
        flow=[
            build_step(
                step_id="first",
                use=StepType.SCRIPT,
                args={"code": "token = 'from-first-step'"},
                outputs={"token": "token"},
            ),
            build_step(
                step_id="second",
                use=StepType.SCRIPT,
                args={"code": "token_copy = token"},
                outputs={"token_copy": "token_copy"},
            ),
        ],
    )

    result = await executor._run_flow(source)

    assert result["token_copy"] == "from-first-step"
    assert captured_top_level_outputs[0] == {}
    assert captured_top_level_outputs[1]["token"] == "from-first-step"
