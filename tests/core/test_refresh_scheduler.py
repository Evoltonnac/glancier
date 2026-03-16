from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

from core.refresh_scheduler import RefreshScheduler


class _DummyDataController:
    def __init__(self, latest_records: list[dict]):
        self._latest_records = latest_records

    def get_all_latest(self):
        return list(self._latest_records)


class _DummyResourceManager:
    def __init__(self, sources: list[SimpleNamespace]):
        self._sources = list(sources)

    def load_sources(self):
        return list(self._sources)

    def get_source(self, source_id: str):
        for source in self._sources:
            if source.id == source_id:
                return source
        return None


class _DummySettingsManager:
    def __init__(self, refresh_interval_minutes: int):
        self._value = refresh_interval_minutes

    def load_settings(self):
        return SimpleNamespace(refresh_interval_minutes=self._value)


class _DummyConfig:
    def __init__(self, integration_defaults: dict[str, int | None]):
        self._integration_defaults = integration_defaults

    def get_integration(self, integration_id: str):
        if integration_id not in self._integration_defaults:
            return None
        return SimpleNamespace(
            default_refresh_interval_minutes=self._integration_defaults[integration_id],
        )


def _build_scheduler(
    *,
    latest_records: list[dict],
    sources: list[SimpleNamespace],
    integration_defaults: dict[str, int | None],
    global_interval: int,
) -> RefreshScheduler:
    return RefreshScheduler(
        executor=SimpleNamespace(
            _update_state=lambda *_args, **_kwargs: None,
            fetch_source=lambda *_args, **_kwargs: None,
        ),
        data_controller=_DummyDataController(latest_records),
        resource_manager=_DummyResourceManager(sources),
        settings_manager=_DummySettingsManager(global_interval),
        get_config=lambda: _DummyConfig(integration_defaults),
        resolve_stored_source=lambda stored: stored,
        tick_seconds=60,
        workers=1,
    )


def test_tick_enqueues_due_active_sources_only():
    now = time.time()
    sources = [
        SimpleNamespace(
            id="source-due",
            integration_id="integration-a",
            config={"refresh_interval_minutes": 5},
        ),
        SimpleNamespace(
            id="source-error",
            integration_id="integration-a",
            config={"refresh_interval_minutes": 5},
        ),
        SimpleNamespace(
            id="source-not-due",
            integration_id="integration-a",
            config={"refresh_interval_minutes": 5},
        ),
    ]
    latest = [
        {
            "source_id": "source-due",
            "status": "active",
            "last_success_at": now - 6 * 60,
        },
        {
            "source_id": "source-error",
            "status": "error",
            "last_success_at": now - 6 * 60,
        },
        {
            "source_id": "source-not-due",
            "status": "active",
            "last_success_at": now - 2 * 60,
        },
    ]
    scheduler = _build_scheduler(
        latest_records=latest,
        sources=sources,
        integration_defaults={"integration-a": 30},
        global_interval=60,
    )

    asyncio.run(scheduler.run_tick_once())

    assert scheduler._queue.qsize() == 1
    assert scheduler._queued_ids == {"source-due"}


def test_tick_uses_source_then_integration_then_global_priority():
    now = time.time()
    sources = [
        # source override: 60m -> not due
        SimpleNamespace(
            id="source-override",
            integration_id="integration-a",
            config={"refresh_interval_minutes": 60},
        ),
        # integration default: 5m -> due
        SimpleNamespace(
            id="integration-default",
            integration_id="integration-a",
            config={},
        ),
        # global default: 30m -> due
        SimpleNamespace(
            id="global-default",
            integration_id="integration-b",
            config={},
        ),
    ]
    latest = [
        {"source_id": "source-override", "status": "active", "last_success_at": now - 10 * 60},
        {"source_id": "integration-default", "status": "active", "last_success_at": now - 10 * 60},
        {"source_id": "global-default", "status": "active", "last_success_at": now - 40 * 60},
    ]
    scheduler = _build_scheduler(
        latest_records=latest,
        sources=sources,
        integration_defaults={"integration-a": 5, "integration-b": None},
        global_interval=30,
    )

    asyncio.run(scheduler.run_tick_once())

    assert scheduler._queued_ids == {"integration-default", "global-default"}
