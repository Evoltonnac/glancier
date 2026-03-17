"""
Durable scraper task persistence for backend-owned webview orchestration.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import RLock
from typing import Any
from uuid import uuid4

ScraperTaskStatus = str
_ACTIVE_STATUSES = {"pending", "claimed", "running"}
_TERMINAL_STATUSES = {"completed", "failed"}


class ScraperTaskStore:
    """Persistence-backed lifecycle store for webview scraper tasks."""

    def __init__(
        self,
        path: str | Path | None = None,
        *,
        now_fn=None,
    ) -> None:
        if path is None:
            data_root = Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data"
            path = data_root / "scraper_tasks.json"
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._now_fn = now_fn or time.time
        with self._lock:
            payload = self._load_payload_locked()
            self._save_payload_locked(payload)

    def _now(self) -> float:
        return float(self._now_fn())

    def _empty_payload(self) -> dict[str, Any]:
        return {"tasks_by_id": {}}

    def _normalize_task(self, task: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        normalized = dict(task)
        normalized.setdefault("task_id", "")
        normalized.setdefault("source_id", "")
        normalized.setdefault("step_id", "webview")
        normalized.setdefault("url", "")
        normalized.setdefault("script", "")
        normalized.setdefault("intercept_api", "")
        normalized.setdefault("secret_key", "webview_data")
        normalized.setdefault("status", "pending")
        normalized.setdefault("attempt_count", 0)
        normalized.setdefault("lease_owner", None)
        normalized.setdefault("lease_expires_at", None)
        normalized.setdefault("created_at", now)
        normalized.setdefault("updated_at", now)
        normalized.setdefault("completed_at", None)
        normalized.setdefault("failed_at", None)
        normalized.setdefault("last_error", None)
        normalized.setdefault("last_attempt", 0)
        return normalized

    def _load_payload_locked(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty_payload()
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return self._empty_payload()
        tasks = payload.get("tasks_by_id") if isinstance(payload, dict) else None
        if not isinstance(tasks, dict):
            return self._empty_payload()
        normalized_tasks: dict[str, dict[str, Any]] = {}
        for task_id, task in tasks.items():
            if not isinstance(task_id, str) or not isinstance(task, dict):
                continue
            normalized_tasks[task_id] = self._normalize_task(task)
        return {"tasks_by_id": normalized_tasks}

    def _save_payload_locked(self, payload: dict[str, Any]) -> None:
        self.path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def _copy_task(self, task: dict[str, Any] | None) -> dict[str, Any] | None:
        return dict(task) if isinstance(task, dict) else None

    def _release_expired_leases_locked(self, payload: dict[str, Any]) -> None:
        now = self._now()
        changed = False
        for task in payload["tasks_by_id"].values():
            if task.get("status") not in {"claimed", "running"}:
                continue
            lease_expires_at = task.get("lease_expires_at")
            if isinstance(lease_expires_at, (int, float)) and lease_expires_at <= now:
                task["status"] = "pending"
                task["lease_owner"] = None
                task["lease_expires_at"] = None
                task["updated_at"] = now
                changed = True
        if changed:
            self._save_payload_locked(payload)

    def _find_active_task_for_source_locked(
        self,
        payload: dict[str, Any],
        source_id: str,
        step_id: str,
    ) -> dict[str, Any] | None:
        candidates = [
            task
            for task in payload["tasks_by_id"].values()
            if task.get("source_id") == source_id
            and task.get("step_id") == step_id
            and task.get("status") in _ACTIVE_STATUSES
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda item: float(item.get("created_at", 0)))

    def upsert_pending_task(
        self,
        *,
        source_id: str,
        step_id: str,
        url: str,
        script: str | None,
        intercept_api: str | None,
        secret_key: str,
    ) -> dict[str, Any]:
        with self._lock:
            payload = self._load_payload_locked()
            self._release_expired_leases_locked(payload)

            existing = self._find_active_task_for_source_locked(payload, source_id, step_id)
            now = self._now()
            if existing is not None:
                existing["url"] = url
                existing["script"] = script or ""
                existing["intercept_api"] = intercept_api or ""
                existing["secret_key"] = secret_key or "webview_data"
                if existing.get("status") == "pending":
                    existing["lease_owner"] = None
                    existing["lease_expires_at"] = None
                existing["updated_at"] = now
                self._save_payload_locked(payload)
                return self._copy_task(existing)  # type: ignore[return-value]

            task_id = f"scraper-{uuid4().hex}"
            record = {
                "task_id": task_id,
                "source_id": source_id,
                "step_id": step_id,
                "url": url,
                "script": script or "",
                "intercept_api": intercept_api or "",
                "secret_key": secret_key or "webview_data",
                "status": "pending",
                "attempt_count": 0,
                "lease_owner": None,
                "lease_expires_at": None,
                "created_at": now,
                "updated_at": now,
                "completed_at": None,
                "failed_at": None,
                "last_error": None,
                "last_attempt": 0,
            }
            payload["tasks_by_id"][task_id] = record
            self._save_payload_locked(payload)
            return self._copy_task(record)  # type: ignore[return-value]

    def claim_next_task(
        self,
        *,
        worker_id: str,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        with self._lock:
            payload = self._load_payload_locked()
            self._release_expired_leases_locked(payload)
            pending = [
                task
                for task in payload["tasks_by_id"].values()
                if task.get("status") == "pending"
            ]
            if not pending:
                return None
            task = min(pending, key=lambda item: float(item.get("created_at", 0)))
            now = self._now()
            task["status"] = "claimed"
            task["attempt_count"] = int(task.get("attempt_count") or 0) + 1
            task["last_attempt"] = task["attempt_count"]
            task["lease_owner"] = worker_id
            task["lease_expires_at"] = now + max(int(lease_seconds), 1)
            task["updated_at"] = now
            task["failed_at"] = None
            task["last_error"] = None
            self._save_payload_locked(payload)
            return self._copy_task(task)

    def heartbeat_task(
        self,
        *,
        task_id: str,
        worker_id: str,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        with self._lock:
            payload = self._load_payload_locked()
            task = payload["tasks_by_id"].get(task_id)
            if task is None:
                return None
            if task.get("status") in _TERMINAL_STATUSES:
                return self._copy_task(task)
            now = self._now()
            owner = task.get("lease_owner")
            lease_expires_at = task.get("lease_expires_at")
            has_valid_foreign_lease = (
                owner not in {None, worker_id}
                and isinstance(lease_expires_at, (int, float))
                and lease_expires_at > now
            )
            if has_valid_foreign_lease:
                return None
            task["status"] = "running"
            task["lease_owner"] = worker_id
            task["lease_expires_at"] = now + max(int(lease_seconds), 1)
            task["updated_at"] = now
            self._save_payload_locked(payload)
            return self._copy_task(task)

    def complete_task(
        self,
        *,
        task_id: str,
        worker_id: str | None,
        attempt: int | None = None,
    ) -> tuple[dict[str, Any] | None, bool]:
        with self._lock:
            payload = self._load_payload_locked()
            task = payload["tasks_by_id"].get(task_id)
            if task is None:
                return None, False
            if task.get("status") == "completed":
                return self._copy_task(task), False
            if attempt is not None and int(task.get("attempt_count") or 0) != int(attempt):
                return self._copy_task(task), False
            now = self._now()
            owner = task.get("lease_owner")
            lease_expires_at = task.get("lease_expires_at")
            if worker_id and owner not in {None, worker_id}:
                if isinstance(lease_expires_at, (int, float)) and lease_expires_at > now:
                    return None, False
            task["status"] = "completed"
            task["lease_owner"] = None
            task["lease_expires_at"] = None
            task["updated_at"] = now
            task["completed_at"] = now
            task["last_error"] = None
            self._save_payload_locked(payload)
            return self._copy_task(task), True

    def fail_task(
        self,
        *,
        task_id: str,
        worker_id: str | None,
        error: str,
        attempt: int | None = None,
    ) -> tuple[dict[str, Any] | None, bool]:
        with self._lock:
            payload = self._load_payload_locked()
            task = payload["tasks_by_id"].get(task_id)
            if task is None:
                return None, False
            if task.get("status") == "failed":
                return self._copy_task(task), False
            if task.get("status") == "completed":
                return self._copy_task(task), False
            if attempt is not None and int(task.get("attempt_count") or 0) != int(attempt):
                return self._copy_task(task), False
            now = self._now()
            owner = task.get("lease_owner")
            lease_expires_at = task.get("lease_expires_at")
            if worker_id and owner not in {None, worker_id}:
                if isinstance(lease_expires_at, (int, float)) and lease_expires_at > now:
                    return None, False
            task["status"] = "failed"
            task["lease_owner"] = None
            task["lease_expires_at"] = None
            task["updated_at"] = now
            task["failed_at"] = now
            task["last_error"] = error
            self._save_payload_locked(payload)
            return self._copy_task(task), True

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self._lock:
            payload = self._load_payload_locked()
            return self._copy_task(payload["tasks_by_id"].get(task_id))

    def list_tasks(self) -> list[dict[str, Any]]:
        with self._lock:
            payload = self._load_payload_locked()
            return [dict(task) for task in payload["tasks_by_id"].values()]

    def list_active_tasks(self) -> list[dict[str, Any]]:
        with self._lock:
            payload = self._load_payload_locked()
            self._release_expired_leases_locked(payload)
            active = [
                dict(task)
                for task in payload["tasks_by_id"].values()
                if task.get("status") in _ACTIVE_STATUSES
            ]
            active.sort(key=lambda task: float(task.get("created_at") or 0))
            return active

    def clear_active_tasks(
        self,
        *,
        source_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Remove active scraper tasks from queue storage.

        Active tasks include pending/claimed/running tasks that have not reached
        a terminal state yet. When source_id is provided, only tasks for that
        source are removed.
        """
        with self._lock:
            payload = self._load_payload_locked()
            removed: list[dict[str, Any]] = []
            task_ids_to_remove: list[str] = []
            for task_id, task in payload["tasks_by_id"].items():
                if task.get("status") not in _ACTIVE_STATUSES:
                    continue
                if source_id and task.get("source_id") != source_id:
                    continue
                removed.append(dict(task))
                task_ids_to_remove.append(task_id)

            for task_id in task_ids_to_remove:
                payload["tasks_by_id"].pop(task_id, None)

            if task_ids_to_remove:
                self._save_payload_locked(payload)
            return removed
