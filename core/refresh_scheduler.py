from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable

from core.refresh_policy import resolve_refresh_interval_minutes
from core.source_state import SourceStatus

logger = logging.getLogger(__name__)


class RefreshScheduler:
    """
    Single-loop auto refresh scheduler with queue-based execution.

    Design:
    - One periodic tick scans all sources and decides if source is due.
    - Due sources are enqueued (deduped by queued + inflight sets).
    - Worker coroutine consumes queue and executes refresh sequentially.
    """

    def __init__(
        self,
        *,
        executor,
        data_controller,
        resource_manager,
        settings_manager,
        get_config: Callable[[], Any],
        resolve_stored_source: Callable[[Any], Any],
        tick_seconds: int = 10,
        workers: int = 1,
    ) -> None:
        self._executor = executor
        self._data_controller = data_controller
        self._resource_manager = resource_manager
        self._settings_manager = settings_manager
        self._get_config = get_config
        self._resolve_stored_source = resolve_stored_source

        self._tick_seconds = max(1, int(tick_seconds))
        self._workers = max(1, int(workers))

        self._queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
        self._queued_ids: set[str] = set()
        self._inflight_ids: set[str] = set()

        self._stop_event = asyncio.Event()
        self._tick_task: asyncio.Task | None = None
        self._worker_tasks: list[asyncio.Task] = []
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._stop_event.clear()
        self._tick_task = asyncio.create_task(self._tick_loop(), name="refresh-scheduler-tick")
        self._worker_tasks = [
            asyncio.create_task(self._worker_loop(i), name=f"refresh-scheduler-worker-{i}")
            for i in range(self._workers)
        ]
        logger.info("RefreshScheduler started (tick=%ss, workers=%s)", self._tick_seconds, self._workers)

    async def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        self._stop_event.set()

        tasks: list[asyncio.Task] = []
        if self._tick_task is not None:
            tasks.append(self._tick_task)
        tasks.extend(self._worker_tasks)

        for task in tasks:
            task.cancel()

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        self._tick_task = None
        self._worker_tasks = []
        self._queued_ids.clear()
        self._inflight_ids.clear()
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
                self._queue.task_done()
            except asyncio.QueueEmpty:
                break
        logger.info("RefreshScheduler stopped")

    async def run_tick_once(self) -> None:
        await self._tick_once()

    async def _tick_loop(self) -> None:
        try:
            while not self._stop_event.is_set():
                await self._tick_once()
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self._tick_seconds)
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("RefreshScheduler tick loop crashed")

    async def _tick_once(self) -> None:
        config = self._get_config()
        if config is None:
            return

        now = time.time()
        latest_records = {
            str(record.get("source_id")): record
            for record in self._data_controller.get_all_latest()
            if isinstance(record, dict) and record.get("source_id")
        }

        global_refresh_interval = 0
        if self._settings_manager is not None:
            try:
                global_refresh_interval = int(
                    getattr(self._settings_manager.load_settings(), "refresh_interval_minutes", 0)
                    or 0,
                )
            except Exception:
                global_refresh_interval = 0

        for stored in self._resource_manager.load_sources():
            record = latest_records.get(stored.id)
            if not record:
                # No successful history yet; do not auto schedule.
                continue

            status = str(record.get("status") or "").strip().lower()
            # User requirement: skip non-success status in tick.
            if status != SourceStatus.ACTIVE.value:
                continue

            source_interval = None
            if isinstance(getattr(stored, "config", None), dict):
                source_interval = stored.config.get("refresh_interval_minutes")

            integration_interval = None
            integration_id = getattr(stored, "integration_id", None)
            if integration_id:
                integration = config.get_integration(integration_id)
                if integration is not None:
                    integration_interval = getattr(integration, "default_refresh_interval_minutes", None)

            effective_interval, _ = resolve_refresh_interval_minutes(
                source_interval,
                integration_interval,
                global_refresh_interval,
            )
            if effective_interval <= 0:
                continue

            last_success_at_raw = record.get("last_success_at", record.get("updated_at"))
            if not isinstance(last_success_at_raw, (int, float)):
                continue

            due = now - float(last_success_at_raw) >= effective_interval * 60
            if not due:
                continue

            await self._enqueue(stored.id, reason="auto")

    async def _worker_loop(self, worker_index: int) -> None:
        try:
            while not self._stop_event.is_set():
                source_id = ""
                try:
                    source_id, reason = await self._queue.get()
                except asyncio.CancelledError:
                    raise

                self._queued_ids.discard(source_id)
                if source_id in self._inflight_ids:
                    self._queue.task_done()
                    continue

                self._inflight_ids.add(source_id)
                try:
                    await self._refresh_source(source_id, reason)
                except Exception:
                    logger.exception("[worker-%s] refresh source failed: %s", worker_index, source_id)
                finally:
                    self._inflight_ids.discard(source_id)
                    self._queue.task_done()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("RefreshScheduler worker-%s crashed", worker_index)

    async def _enqueue(self, source_id: str, reason: str) -> bool:
        if source_id in self._queued_ids or source_id in self._inflight_ids:
            return False
        self._queued_ids.add(source_id)
        await self._queue.put((source_id, reason))
        return True

    async def _refresh_source(self, source_id: str, reason: str) -> None:
        stored = self._resource_manager.get_source(source_id)
        if stored is None:
            return

        source = self._resolve_stored_source(stored)
        if source is None:
            logger.warning("[%s] skip queued refresh (%s): source resolve failed", source_id, reason)
            return

        self._executor._update_state(  # noqa: SLF001 - existing internal API usage in project.
            source_id,
            SourceStatus.REFRESHING,
            f"Queued ({reason}) refresh: fetching latest data...",
        )
        await self._executor.fetch_source(source)
