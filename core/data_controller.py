"""
Data controller: JSON-based persistence layer.
Uses source_id as the primary key to avoid index-based doc_id ambiguity.
"""

import json
import logging
import os
import time
from pathlib import Path
from threading import RLock
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.getenv("GLANCIER_DATA_DIR", ".")) / "data"


class DataController:
    """JSON data operations wrapper (source_id-keyed storage)."""

    def __init__(self, db_path: str | Path | None = None):
        if db_path is None:
            db_path = _DATA_DIR / "data.json"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()

        with self._lock:
            payload = self._load_payload_locked()
            self._save_payload_locked(payload)
        logger.info("JSON database opened: %s", self.db_path)

    def _empty_payload(self) -> dict[str, dict]:
        return {
            "latest_by_source": {},
            "history_by_source": {},
        }

    def _normalize_payload(self, payload: Any) -> dict[str, dict]:
        if not isinstance(payload, dict):
            return self._empty_payload()

        if "latest_by_source" in payload or "history_by_source" in payload:
            latest = payload.get("latest_by_source")
            history = payload.get("history_by_source")
            return {
                "latest_by_source": latest if isinstance(latest, dict) else {},
                "history_by_source": history if isinstance(history, dict) else {},
            }

        # Backward-compat migration for legacy TinyDB structure:
        # { "latest": {"1": {...}}, "history": {"2": {...}} }
        latest_by_source: dict[str, dict[str, Any]] = {}
        history_by_source: dict[str, list[dict[str, Any]]] = {}

        latest_legacy = payload.get("latest")
        if isinstance(latest_legacy, dict):
            for record in latest_legacy.values():
                if not isinstance(record, dict):
                    continue
                source_id = str(record.get("source_id") or "").strip()
                if source_id:
                    latest_by_source[source_id] = dict(record)

        history_legacy = payload.get("history")
        if isinstance(history_legacy, dict):
            for record in history_legacy.values():
                if not isinstance(record, dict):
                    continue
                source_id = str(record.get("source_id") or "").strip()
                if not source_id:
                    continue
                history_by_source.setdefault(source_id, []).append(dict(record))

        for source_id, records in history_by_source.items():
            records.sort(key=lambda r: r.get("timestamp", 0), reverse=True)

        return {
            "latest_by_source": latest_by_source,
            "history_by_source": history_by_source,
        }

    def _load_payload_locked(self) -> dict[str, dict]:
        if not self.db_path.exists():
            return self._empty_payload()
        try:
            with open(self.db_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as exc:
            logger.error("failed to read data file: %s", exc)
            return self._empty_payload()
        return self._normalize_payload(payload)

    def _save_payload_locked(self, payload: dict[str, dict]) -> None:
        with open(self.db_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    # ── Writes ────────────────────────────────────────

    def upsert(self, source_id: str, data: dict[str, Any]):
        """
        Update or insert latest data (deduplicated by source_id).
        No history records are appended here.
        Clears previously stored error field on success.
        """
        now = time.time()
        record = {
            "source_id": source_id,
            "data": data,
            "updated_at": now,
            "last_success_at": now,
        }
        with self._lock:
            payload = self._load_payload_locked()
            payload["latest_by_source"][source_id] = record
            self._save_payload_locked(payload)
        logger.debug("[%s] latest data updated (history not appended)", source_id)

    def set_error(self, source_id: str, error: str):
        """Record source fetch error."""
        now = time.time()
        record = {
            "source_id": source_id,
            "data": None,
            "error": error,
            "updated_at": now,
        }
        with self._lock:
            payload = self._load_payload_locked()
            payload["latest_by_source"][source_id] = record
            self._save_payload_locked(payload)

    def set_state(
        self,
        source_id: str,
        status: str,
        message: str | None = None,
        interaction: dict | None = None,
        error: str | None = None,
    ):
        """
        Persist runtime state for a source (used by SourceState persistence).
        Call this when execution fails or requires user interaction.
        """
        now = time.time()
        with self._lock:
            payload = self._load_payload_locked()
            existing = payload["latest_by_source"].get(source_id) or {"source_id": source_id}
            record = dict(existing)
            record.update(
                {
                    "source_id": source_id,
                    "status": status,
                    "message": message,
                    "interaction": interaction,
                    "updated_at": now,
                }
            )
            if error is not None:
                record["error"] = error
            elif status != "error":
                # Proactively clear stale error in non-error states.
                record.pop("error", None)
            payload["latest_by_source"][source_id] = record
            self._save_payload_locked(payload)
        logger.debug("[%s] state persisted: %s", source_id, status)

    # ── Queries ───────────────────────────────────────

    def get_latest(self, source_id: str) -> dict | None:
        """Get latest data for a source."""
        with self._lock:
            payload = self._load_payload_locked()
            latest = payload["latest_by_source"].get(source_id)
            return dict(latest) if isinstance(latest, dict) else None

    def get_all_latest(self) -> list[dict]:
        """Get latest data for all sources."""
        with self._lock:
            payload = self._load_payload_locked()
            return [
                dict(record)
                for record in payload["latest_by_source"].values()
                if isinstance(record, dict)
            ]

    def get_history(
        self,
        source_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """Get source history records sorted by timestamp descending."""
        with self._lock:
            payload = self._load_payload_locked()
            records = payload["history_by_source"].get(source_id, [])
            records = [dict(record) for record in records if isinstance(record, dict)]
            records.sort(key=lambda r: r.get("timestamp", 0), reverse=True)
            return records[:limit]

    # ── Management ────────────────────────────────────

    def clear_source(self, source_id: str):
        """Clear all stored data for a source."""
        with self._lock:
            payload = self._load_payload_locked()
            payload["latest_by_source"].pop(source_id, None)
            payload["history_by_source"].pop(source_id, None)
            self._save_payload_locked(payload)

    def close(self):
        """Close database resources (no-op for JSON mode)."""
        return None
