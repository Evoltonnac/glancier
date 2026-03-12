"""
数据控制器：基于 JSON 的数据持久化层。
按 source_id 作为主键存储，避免序号 doc_id 带来的可读性与维护问题。
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
    """JSON 数据操作封装（source_id keyed storage）。"""

    def __init__(self, db_path: str | Path | None = None):
        if db_path is None:
            db_path = _DATA_DIR / "data.json"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()

        with self._lock:
            payload = self._load_payload_locked()
            self._save_payload_locked(payload)
        logger.info(f"JSON 数据库已打开: {self.db_path}")

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

        # 兼容并迁移 legacy TinyDB 结构:
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
            logger.error("读取 data 文件失败: %s", exc)
            return self._empty_payload()
        return self._normalize_payload(payload)

    def _save_payload_locked(self, payload: dict[str, dict]) -> None:
        with open(self.db_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    # ── 写入 ──────────────────────────────────────────

    def upsert(self, source_id: str, data: dict[str, Any]):
        """
        更新或插入最新数据（按 source_id 去重）。
        不再追加历史记录。
        成功时会清除之前存储的 error 信息。
        """
        now = time.time()
        record = {
            "source_id": source_id,
            "data": data,
            "updated_at": now,
        }
        with self._lock:
            payload = self._load_payload_locked()
            payload["latest_by_source"][source_id] = record
            self._save_payload_locked(payload)
        logger.debug(f"[{source_id}] 数据已更新 (不记录历史)")

    def set_error(self, source_id: str, error: str):
        """记录数据源抓取错误。"""
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
        记录数据源的运行时状态（用于持久化 SourceState）。
        当执行异常或需要用户交互时，调用此方法将状态存储到 data 中。
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
                # 非错误态主动清理旧错误，避免 UI 长期显示陈旧错误。
                record.pop("error", None)
            payload["latest_by_source"][source_id] = record
            self._save_payload_locked(payload)
        logger.debug(f"[{source_id}] 状态已持久化: {status}")

    # ── 查询 ──────────────────────────────────────────

    def get_latest(self, source_id: str) -> dict | None:
        """获取指定数据源的最新数据。"""
        with self._lock:
            payload = self._load_payload_locked()
            latest = payload["latest_by_source"].get(source_id)
            return dict(latest) if isinstance(latest, dict) else None

    def get_all_latest(self) -> list[dict]:
        """获取所有数据源的最新数据。"""
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
        """获取指定数据源的历史数据（按时间倒序）。"""
        with self._lock:
            payload = self._load_payload_locked()
            records = payload["history_by_source"].get(source_id, [])
            records = [dict(record) for record in records if isinstance(record, dict)]
            records.sort(key=lambda r: r.get("timestamp", 0), reverse=True)
            return records[:limit]

    # ── 管理 ──────────────────────────────────────────

    def clear_source(self, source_id: str):
        """清除指定数据源的所有数据。"""
        with self._lock:
            payload = self._load_payload_locked()
            payload["latest_by_source"].pop(source_id, None)
            payload["history_by_source"].pop(source_id, None)
            self._save_payload_locked(payload)

    def close(self):
        """关闭数据库（JSON 模式无需关闭句柄）。"""
        return None
