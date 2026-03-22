from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest

from core.refresh_scheduler import RefreshScheduler


class _DummyDataController:
    def __init__(self, latest_records: list[dict]):
        self._latest_by_source = {
            str(record.get("source_id")): record
            for record in latest_records
            if isinstance(record, dict) and record.get("source_id")
        }

    def get_all_latest(self):
        return list(self._latest_by_source.values())

    def set_retry_metadata(self, source_id: str, metadata: dict | None):
        record = self._latest_by_source.get(source_id)
        if record is None:
            return
        if metadata is None:
            record.pop("retry_metadata", None)
        else:
            record["retry_metadata"] = dict(metadata)

    def clear_retry_metadata(self, source_id: str):
        self.set_retry_metadata(source_id, None)


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


def _drain_scheduler_queue(scheduler: RefreshScheduler) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    while not scheduler._queue.empty():
        entries.append(scheduler._queue.get_nowait())
        scheduler._queue.task_done()
    scheduler._queued_ids.clear()
    return entries


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


def test_tick_supports_custom_integration_interval_minutes():
    now = time.time()
    sources = [
        SimpleNamespace(
            id="integration-custom-due",
            integration_id="integration-custom",
            config={},
        ),
        SimpleNamespace(
            id="integration-custom-not-due",
            integration_id="integration-custom",
            config={},
        ),
    ]
    latest = [
        {
            "source_id": "integration-custom-due",
            "status": "active",
            "last_success_at": now - 130 * 60,
        },
        {
            "source_id": "integration-custom-not-due",
            "status": "active",
            "last_success_at": now - 100 * 60,
        },
    ]
    scheduler = _build_scheduler(
        latest_records=latest,
        sources=sources,
        integration_defaults={"integration-custom": 120},
        global_interval=30,
    )

    asyncio.run(scheduler.run_tick_once())

    assert scheduler._queued_ids == {"integration-custom-due"}


def test_tick_enqueues_retryable_runtime_error_after_backoff(monkeypatch):
    now = time.time()
    source = SimpleNamespace(
        id="retryable-error-source",
        integration_id="integration-a",
        config={"refresh_interval_minutes": 5},
    )
    latest = [
        {
            "source_id": source.id,
            "status": "error",
            "error_code": "runtime.network_timeout",
            "updated_at": now - 61,
        }
    ]
    scheduler = _build_scheduler(
        latest_records=latest,
        sources=[source],
        integration_defaults={"integration-a": 5},
        global_interval=30,
    )

    monkeypatch.setattr("core.refresh_scheduler.time.time", lambda: now)
    asyncio.run(scheduler.run_tick_once())

    assert scheduler._queued_ids == {source.id}
    retry_state = scheduler._retry_states[source.id]
    assert retry_state["attempts"] == 1
    assert retry_state["signature"] == "runtime.network_timeout"


def test_tick_skips_non_retryable_error_codes_for_error_and_suspended():
    now = time.time()
    sources = [
        SimpleNamespace(
            id="manual-required-error",
            integration_id="integration-a",
            config={},
        ),
        SimpleNamespace(
            id="manual-required-suspended",
            integration_id="integration-a",
            config={},
        ),
    ]
    latest = [
        {
            "source_id": "manual-required-error",
            "status": "error",
            "error_code": "auth.manual_webview_required",
            "updated_at": now - 10_000,
        },
        {
            "source_id": "manual-required-suspended",
            "status": "suspended",
            "error_code": "auth.manual_webview_required",
            "updated_at": now - 10_000,
        },
    ]
    scheduler = _build_scheduler(
        latest_records=latest,
        sources=sources,
        integration_defaults={"integration-a": 5},
        global_interval=30,
    )

    asyncio.run(scheduler.run_tick_once())

    assert scheduler._queued_ids == set()


def test_tick_applies_retry_backoff_windows_and_caps_at_three(monkeypatch):
    base = 10_000.0
    source = SimpleNamespace(
        id="retry-cap-source",
        integration_id="integration-a",
        config={"refresh_interval_minutes": 5},
    )
    latest_record = {
        "source_id": source.id,
        "status": "error",
        "error_code": "runtime.retry_required",
        "updated_at": base,
    }
    scheduler = _build_scheduler(
        latest_records=[latest_record],
        sources=[source],
        integration_defaults={"integration-a": 5},
        global_interval=30,
    )

    current_time = {"value": base + 59}
    monkeypatch.setattr("core.refresh_scheduler.time.time", lambda: current_time["value"])

    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    current_time["value"] = base + 60
    asyncio.run(scheduler.run_tick_once())
    first = _drain_scheduler_queue(scheduler)
    assert first == [(source.id, "retry:runtime.retry_required")]
    assert scheduler._retry_states[source.id]["attempts"] == 1

    latest_record["updated_at"] = base + 100
    current_time["value"] = base + 239
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    current_time["value"] = base + 240
    asyncio.run(scheduler.run_tick_once())
    second = _drain_scheduler_queue(scheduler)
    assert second == [(source.id, "retry:runtime.retry_required")]
    assert scheduler._retry_states[source.id]["attempts"] == 2

    latest_record["updated_at"] = base + 400
    current_time["value"] = base + 1000
    asyncio.run(scheduler.run_tick_once())
    third = _drain_scheduler_queue(scheduler)
    assert third == [(source.id, "retry:runtime.retry_required")]
    assert scheduler._retry_states[source.id]["attempts"] == 3

    latest_record["updated_at"] = base + 1500
    current_time["value"] = base + 50_000
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()


def test_retry_budget_survives_transient_active_state(monkeypatch):
    base = 20_000.0
    source = SimpleNamespace(
        id="retry-active-reset-source",
        integration_id="integration-a",
        config={"refresh_interval_minutes": 5},
    )
    latest_record = {
        "source_id": source.id,
        "status": "error",
        "error_code": "runtime.retry_required",
        "updated_at": base,
    }
    scheduler = _build_scheduler(
        latest_records=[latest_record],
        sources=[source],
        integration_defaults={"integration-a": 5},
        global_interval=30,
    )
    current_time = {"value": base + 60}
    monkeypatch.setattr("core.refresh_scheduler.time.time", lambda: current_time["value"])

    asyncio.run(scheduler.run_tick_once())
    first = _drain_scheduler_queue(scheduler)
    assert first == [(source.id, "retry:runtime.retry_required")]

    latest_record["status"] = "active"
    latest_record["updated_at"] = base + 90
    current_time["value"] = base + 90
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    latest_record["status"] = "error"
    latest_record["updated_at"] = base + 95
    current_time["value"] = base + 155
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    current_time["value"] = base + 240
    asyncio.run(scheduler.run_tick_once())
    second = _drain_scheduler_queue(scheduler)
    assert second == [(source.id, "retry:runtime.retry_required")]


def test_retry_backoff_not_coupled_to_updated_at_churn(monkeypatch):
    base = 30_000.0
    source = SimpleNamespace(
        id="retry-updated-at-source",
        integration_id="integration-a",
        config={"refresh_interval_minutes": 5},
    )
    latest_record = {
        "source_id": source.id,
        "status": "error",
        "error_code": "runtime.network_timeout",
        "updated_at": base,
    }
    scheduler = _build_scheduler(
        latest_records=[latest_record],
        sources=[source],
        integration_defaults={"integration-a": 5},
        global_interval=30,
    )
    current_time = {"value": base + 60}
    monkeypatch.setattr("core.refresh_scheduler.time.time", lambda: current_time["value"])

    asyncio.run(scheduler.run_tick_once())
    first = _drain_scheduler_queue(scheduler)
    assert first == [(source.id, "retry:runtime.network_timeout")]

    latest_record["updated_at"] = base + 130
    current_time["value"] = base + 130
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    latest_record["updated_at"] = base + 230
    current_time["value"] = base + 240
    asyncio.run(scheduler.run_tick_once())
    second = _drain_scheduler_queue(scheduler)
    assert second == [(source.id, "retry:runtime.network_timeout")]


@pytest.mark.parametrize(
    "error_code",
    [
        "runtime.retry_required",
        "runtime.network_timeout",
    ],
)
def test_retryable_codes_keep_budget_across_error_suspended_churn(monkeypatch, error_code):
    base = 40_000.0
    source = SimpleNamespace(
        id=f"retry-status-churn-{error_code}",
        integration_id="integration-a",
        config={"refresh_interval_minutes": 5},
    )
    latest_record = {
        "source_id": source.id,
        "status": "error",
        "error_code": error_code,
        "updated_at": base,
    }
    scheduler = _build_scheduler(
        latest_records=[latest_record],
        sources=[source],
        integration_defaults={"integration-a": 5},
        global_interval=30,
    )
    current_time = {"value": base + 60}
    monkeypatch.setattr("core.refresh_scheduler.time.time", lambda: current_time["value"])

    asyncio.run(scheduler.run_tick_once())
    first = _drain_scheduler_queue(scheduler)
    assert first == [(source.id, f"retry:{error_code}")]

    latest_record["status"] = "suspended"
    latest_record["updated_at"] = base + 70
    current_time["value"] = base + 120
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    latest_record["status"] = "error"
    latest_record["updated_at"] = base + 130
    current_time["value"] = base + 239
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()

    current_time["value"] = base + 240
    asyncio.run(scheduler.run_tick_once())
    second = _drain_scheduler_queue(scheduler)
    assert second == [(source.id, f"retry:{error_code}")]

    latest_record["status"] = "suspended"
    latest_record["updated_at"] = base + 300
    current_time["value"] = base + 840
    asyncio.run(scheduler.run_tick_once())
    third = _drain_scheduler_queue(scheduler)
    assert third == [(source.id, f"retry:{error_code}")]

    latest_record["status"] = "error"
    latest_record["updated_at"] = base + 900
    current_time["value"] = base + 20_000
    asyncio.run(scheduler.run_tick_once())
    assert scheduler._queued_ids == set()
