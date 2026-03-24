from __future__ import annotations

import json
import sqlite3
import time
from threading import RLock
from typing import Any, Callable, TypeVar

from core.network_trust.models import (
    ConnectionTrustRule,
    PersistedTrustDecision,
    TrustScopeType,
)
from core.storage.errors import map_sqlite_error

_T = TypeVar("_T")


class SqliteTrustRuleRepository:
    def __init__(self, connection: sqlite3.Connection):
        self._connection = connection
        self._lock = RLock()

    def _write(self, operation: str, action: Callable[[], _T]) -> _T:
        try:
            self._connection.execute("BEGIN IMMEDIATE")
        except sqlite3.Error as error:
            raise map_sqlite_error(error, kind="write", operation=operation) from error

        try:
            result = action()
        except Exception as error:
            self._connection.rollback()
            if isinstance(error, sqlite3.Error):
                raise map_sqlite_error(error, kind="write", operation=operation) from error
            raise

        try:
            self._connection.commit()
        except sqlite3.Error as error:
            self._connection.rollback()
            raise map_sqlite_error(error, kind="write", operation=operation) from error
        return result

    def upsert_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
        decision: str,
        metadata: dict[str, Any] | None = None,
        expires_at: float | None = None,
    ) -> ConnectionTrustRule:
        normalized_capability = capability.strip().lower()
        normalized_scope = TrustScopeType(scope_type.strip().lower())
        normalized_source_id = source_id.strip() if isinstance(source_id, str) else None
        normalized_target_type = target_type.strip().lower()
        normalized_target_value = target_value.strip().lower()
        normalized_decision = PersistedTrustDecision(decision.strip().lower())
        metadata_json = json.dumps(metadata or {}, ensure_ascii=False)
        if normalized_scope == TrustScopeType.GLOBAL:
            normalized_source_id = None
        elif not normalized_source_id:
            raise ValueError("source_id is required for source-scoped trust rules")

        with self._lock:
            def _action() -> None:
                row = self._select_identity_row(
                    capability=normalized_capability,
                    scope_type=normalized_scope.value,
                    source_id=normalized_source_id,
                    target_type=normalized_target_type,
                    target_value=normalized_target_value,
                )
                now = time.time()
                if row is None:
                    self._connection.execute(
                        """
                        INSERT INTO connection_trust_rules(
                            capability,
                            scope_type,
                            source_id,
                            target_type,
                            target_value,
                            decision,
                            created_at,
                            updated_at,
                            expires_at,
                            metadata_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            normalized_capability,
                            normalized_scope.value,
                            normalized_source_id,
                            normalized_target_type,
                            normalized_target_value,
                            normalized_decision.value,
                            now,
                            now,
                            expires_at,
                            metadata_json,
                        ),
                    )
                    return

                self._connection.execute(
                    """
                    UPDATE connection_trust_rules
                    SET decision = ?, updated_at = ?, expires_at = ?, metadata_json = ?
                    WHERE rule_id = ?
                    """,
                    (
                        normalized_decision.value,
                        now,
                        expires_at,
                        metadata_json,
                        row["rule_id"],
                    ),
                )

            self._write("trust_rule.upsert_rule", _action)

            rule = self.find_rule(
                capability=normalized_capability,
                scope_type=normalized_scope.value,
                source_id=normalized_source_id,
                target_type=normalized_target_type,
                target_value=normalized_target_value,
            )
            if rule is None:
                raise RuntimeError("failed to load trust rule after upsert")
            return rule

    def find_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
    ) -> ConnectionTrustRule | None:
        normalized_capability = capability.strip().lower()
        normalized_scope = TrustScopeType(scope_type.strip().lower())
        normalized_source_id = source_id.strip() if isinstance(source_id, str) else None
        normalized_target_type = target_type.strip().lower()
        normalized_target_value = target_value.strip().lower()
        if normalized_scope == TrustScopeType.GLOBAL:
            normalized_source_id = None
        with self._lock:
            row = self._select_identity_row(
                capability=normalized_capability,
                scope_type=normalized_scope.value,
                source_id=normalized_source_id,
                target_type=normalized_target_type,
                target_value=normalized_target_value,
            )
            if row is None:
                return None

            expires_at = row["expires_at"]
            if isinstance(expires_at, (int, float)) and expires_at <= time.time():
                return None

            return self._row_to_rule(row)

    def delete_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
    ) -> bool:
        normalized_capability = capability.strip().lower()
        normalized_scope = TrustScopeType(scope_type.strip().lower())
        normalized_source_id = source_id.strip() if isinstance(source_id, str) else None
        normalized_target_type = target_type.strip().lower()
        normalized_target_value = target_value.strip().lower()
        if normalized_scope == TrustScopeType.GLOBAL:
            normalized_source_id = None

        with self._lock:
            def _action():
                if normalized_source_id is None:
                    return self._connection.execute(
                        """
                        DELETE FROM connection_trust_rules
                        WHERE capability = ?
                          AND scope_type = ?
                          AND source_id IS NULL
                          AND target_type = ?
                          AND target_value = ?
                        """,
                        (
                            normalized_capability,
                            normalized_scope.value,
                            normalized_target_type,
                            normalized_target_value,
                        ),
                    )

                return self._connection.execute(
                    """
                    DELETE FROM connection_trust_rules
                    WHERE capability = ?
                      AND scope_type = ?
                      AND source_id = ?
                      AND target_type = ?
                      AND target_value = ?
                    """,
                    (
                        normalized_capability,
                        normalized_scope.value,
                        normalized_source_id,
                        normalized_target_type,
                        normalized_target_value,
                    ),
                )

            cursor = self._write("trust_rule.delete_rule", _action)
            return cursor.rowcount > 0

    def list_source_rules(self, *, source_id: str) -> list[ConnectionTrustRule]:
        normalized_source_id = source_id.strip()
        if not normalized_source_id:
            return []

        with self._lock:
            try:
                rows = self._connection.execute(
                    """
                    SELECT *
                    FROM connection_trust_rules
                    WHERE scope_type = 'source' AND source_id = ?
                    ORDER BY updated_at DESC
                    """,
                    (normalized_source_id,),
                ).fetchall()
            except sqlite3.Error as error:
                raise map_sqlite_error(
                    error,
                    kind="read",
                    operation="trust_rule.list_source_rules",
                ) from error

        result: list[ConnectionTrustRule] = []
        for row in rows:
            expires_at = row["expires_at"]
            if isinstance(expires_at, (int, float)) and expires_at <= time.time():
                continue
            result.append(self._row_to_rule(row))
        return result

    def _select_identity_row(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
    ):
        try:
            if source_id is None:
                return self._connection.execute(
                    """
                    SELECT *
                    FROM connection_trust_rules
                    WHERE capability = ?
                      AND scope_type = ?
                      AND source_id IS NULL
                      AND target_type = ?
                      AND target_value = ?
                    LIMIT 1
                    """,
                    (capability, scope_type, target_type, target_value),
                ).fetchone()

            return self._connection.execute(
                """
                SELECT *
                FROM connection_trust_rules
                WHERE capability = ?
                  AND scope_type = ?
                  AND source_id = ?
                  AND target_type = ?
                  AND target_value = ?
                LIMIT 1
                """,
                (capability, scope_type, source_id, target_type, target_value),
            ).fetchone()
        except sqlite3.Error as error:
            raise map_sqlite_error(error, kind="read", operation="trust_rule.select_identity") from error

    def _row_to_rule(self, row: sqlite3.Row) -> ConnectionTrustRule:
        metadata_raw = row["metadata_json"]
        metadata: dict[str, Any]
        try:
            decoded = json.loads(metadata_raw) if isinstance(metadata_raw, str) else {}
            metadata = decoded if isinstance(decoded, dict) else {}
        except Exception:
            metadata = {}

        return ConnectionTrustRule(
            rule_id=int(row["rule_id"]),
            capability=str(row["capability"]),
            scope_type=TrustScopeType(str(row["scope_type"])),
            source_id=row["source_id"],
            target_type=str(row["target_type"]),
            target_value=str(row["target_value"]),
            decision=PersistedTrustDecision(str(row["decision"])),
            created_at=float(row["created_at"]),
            updated_at=float(row["updated_at"]),
            expires_at=float(row["expires_at"]) if isinstance(row["expires_at"], (int, float)) else None,
            metadata=metadata,
        )
