"""
数据控制器：基于 TinyDB 的数据持久化层。
支持 upsert（按 source_id）、历史记录追加、查询。
"""

import logging
import os
import time
from pathlib import Path
from typing import Any

from tinydb import Query, TinyDB

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.getenv("GLANCIER_DATA_DIR", ".")) / "data"


class DataController:
    """TinyDB 数据操作封装。"""

    def __init__(self, db_path: str | Path | None = None):
        if db_path is None:
            db_path = _DATA_DIR / "data.json"
        db_path = Path(db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)

        self.db = TinyDB(str(db_path), indent=2, ensure_ascii=False)
        self.latest_table = self.db.table("latest")
        self.history_table = self.db.table("history")
        logger.info(f"TinyDB 数据库已打开: {db_path}")

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

        Source = Query()
        # 先删除现有记录（包含可能的 error），再插入新记录
        self.latest_table.remove(Source.source_id == source_id)
        self.latest_table.insert(record)

        # 暂时禁用历史记录存储
        # history_record = {
        #     "source_id": source_id,
        #     "data": data,
        #     "timestamp": now,
        # }
        # self.history_table.insert(history_record)
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
        Source = Query()
        self.latest_table.upsert(record, Source.source_id == source_id)

    def set_state(
        self,
        source_id: str,
        status: str,
        message: str | None = None,
        interaction: dict | None = None,
    ):
        """
        记录数据源的运行时状态（用于持久化 SourceState）。
        当执行异常或需要用户交互时，调用此方法将状态存储到 data 中。
        """
        now = time.time()
        record = {
            "source_id": source_id,
            "status": status,
            "message": message,
            "interaction": interaction,
            "updated_at": now,
        }
        Source = Query()
        self.latest_table.upsert(record, Source.source_id == source_id)
        logger.debug(f"[{source_id}] 状态已持久化: {status}")

    # ── 查询 ──────────────────────────────────────────

    def get_latest(self, source_id: str) -> dict | None:
        """获取指定数据源的最新数据。"""
        Source = Query()
        results = self.latest_table.search(Source.source_id == source_id)
        return results[0] if results else None

    def get_all_latest(self) -> list[dict]:
        """获取所有数据源的最新数据。"""
        return self.latest_table.all()

    def get_history(
        self,
        source_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """获取指定数据源的历史数据（按时间倒序）。"""
        Source = Query()
        records = self.history_table.search(Source.source_id == source_id)
        records.sort(key=lambda r: r.get("timestamp", 0), reverse=True)
        return records[:limit]

    # ── 管理 ──────────────────────────────────────────

    def clear_source(self, source_id: str):
        """清除指定数据源的所有数据。"""
        Source = Query()
        self.latest_table.remove(Source.source_id == source_id)
        self.history_table.remove(Source.source_id == source_id)

    def close(self):
        """关闭数据库。"""
        self.db.close()
