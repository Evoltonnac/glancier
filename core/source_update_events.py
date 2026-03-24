"""
In-memory source update event bus for lightweight websocket notifications.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class _Subscriber:
    queue: asyncio.Queue[dict[str, Any]]
    loop: asyncio.AbstractEventLoop


class SourceUpdateEventBus:
    """
    Broadcast source-level update notifications to websocket subscribers.

    Design goals:
    - Keep websocket payload lightweight (summary/change notification only).
    - Retain a bounded recent history so reconnecting clients can replay gaps.
    - Never block write paths (`set_state`, `upsert`) on slow websocket clients.
    """

    def __init__(self, history_limit: int = 2048, queue_maxsize: int = 256) -> None:
        self._history: deque[dict[str, Any]] = deque(maxlen=max(history_limit, 1))
        self._queue_maxsize = max(queue_maxsize, 1)
        self._subscribers: set[_Subscriber] = set()
        self._next_seq = 1
        self._lock = threading.Lock()

    def publish_source_updated(
        self,
        source_id: str,
        *,
        event_type: str,
        updated_at: float | None = None,
        status: str | None = None,
        error_code: str | None = None,
    ) -> dict[str, Any]:
        if not source_id:
            raise ValueError("source_id is required")

        event_updated_at = (
            float(updated_at)
            if isinstance(updated_at, (int, float))
            else time.time()
        )
        payload: dict[str, Any] = {
            "event": "source.updated",
            "source_id": source_id,
            "event_type": event_type,
            "updated_at": event_updated_at,
        }
        if status is not None:
            payload["status"] = status
        if error_code is not None:
            payload["error_code"] = error_code

        with self._lock:
            seq = self._next_seq
            self._next_seq += 1
            payload["seq"] = seq
            self._history.append(payload)
            subscribers = tuple(self._subscribers)

        for subscriber in subscribers:
            subscriber.loop.call_soon_threadsafe(
                self._offer_to_queue,
                subscriber.queue,
                payload,
            )
        return payload

    @staticmethod
    def _offer_to_queue(
        queue: asyncio.Queue[dict[str, Any]],
        payload: dict[str, Any],
    ) -> None:
        try:
            queue.put_nowait(payload)
            return
        except asyncio.QueueFull:
            pass

        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            return

        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            # If another producer filled the queue, drop this event for this client.
            return

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
            maxsize=self._queue_maxsize,
        )
        subscriber = _Subscriber(queue=queue, loop=loop)
        with self._lock:
            self._subscribers.add(subscriber)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        with self._lock:
            self._subscribers = {
                subscriber
                for subscriber in self._subscribers
                if subscriber.queue is not queue
            }

    def replay_since(
        self,
        since_seq: int | None,
    ) -> tuple[bool, list[dict[str, Any]], int]:
        """
        Return (sync_required, replay_events, latest_seq).

        sync_required=True means the requested since_seq is older than retained
        history and client should fall back to list polling for reconciliation.
        """
        with self._lock:
            latest_seq = self._next_seq - 1
            if since_seq is None:
                return False, [], latest_seq

            if not self._history:
                return False, [], latest_seq

            oldest_seq = int(self._history[0].get("seq", 0))
            if since_seq < oldest_seq - 1:
                return True, [], latest_seq

            events = [
                event
                for event in self._history
                if int(event.get("seq", 0)) > since_seq
            ]
            return False, events, latest_seq

    def latest_seq(self) -> int:
        with self._lock:
            return self._next_seq - 1
