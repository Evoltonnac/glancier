from __future__ import annotations

import asyncio

import pytest

from core.config_loader import StepType
from core.executor import Executor
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_fetch_source_skips_duplicate_trigger_while_inflight(
    data_controller,
    secrets_controller,
    monkeypatch: pytest.MonkeyPatch,
):
    executor = Executor(
        data_controller,
        secrets_controller,
        max_concurrent_fetches=4,
    )
    source = build_source_config(
        source_id="same-source",
        flow=[build_step(step_id="noop", use=StepType.SCRIPT, args={"code": "x = 1"})],
    )

    run_count = 0

    async def fake_run_flow(_source):
        nonlocal run_count
        run_count += 1
        await asyncio.sleep(0.05)
        return {"ok": True}

    monkeypatch.setattr(executor, "_run_flow", fake_run_flow)

    await asyncio.gather(
        executor.fetch_source(source),
        executor.fetch_source(source),
    )

    assert run_count == 1
    assert data_controller.upsert.call_count == 1


@pytest.mark.asyncio
async def test_fetch_source_honors_global_concurrency_limit(
    data_controller,
    secrets_controller,
    monkeypatch: pytest.MonkeyPatch,
):
    executor = Executor(
        data_controller,
        secrets_controller,
        max_concurrent_fetches=1,
    )
    source_a = build_source_config(
        source_id="source-a",
        flow=[build_step(step_id="noop-a", use=StepType.SCRIPT, args={"code": "x = 1"})],
    )
    source_b = build_source_config(
        source_id="source-b",
        flow=[build_step(step_id="noop-b", use=StepType.SCRIPT, args={"code": "x = 1"})],
    )

    active = 0
    max_active = 0

    async def fake_run_flow(source):
        nonlocal active, max_active
        _ = source
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0.05)
        active -= 1
        return {"ok": True}

    monkeypatch.setattr(executor, "_run_flow", fake_run_flow)

    await asyncio.gather(
        executor.fetch_source(source_a),
        executor.fetch_source(source_b),
    )

    assert max_active == 1
    assert data_controller.upsert.call_count == 2
