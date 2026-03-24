"""
SQL step runtime execution.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from core.network_trust.models import TrustDecision, TrustResolution
from core.sql.contracts import classify_sql_contract

if TYPE_CHECKING:
    from core.config_loader import SourceConfig, StepConfig
    from core.executor import Executor


_SQL_RISK_REQUIRES_TRUST_CODE = "runtime.sql_risk_operation_requires_trust"
_SQL_RISK_DENIED_CODE = "runtime.sql_risk_operation_denied"


@dataclass(slots=True)
class _SqlTrustBinding:
    target_type: str
    target_value: str
    decision: TrustDecision
    decision_source: str


class SqlRiskOperationTrustRequiredError(RuntimeError):
    def __init__(self, *, source_id: str, step_id: str, data: dict[str, Any]):
        message = "SQL risk operation requires trust confirmation."
        super().__init__(message)
        self.source_id = source_id
        self.step_id = step_id
        self.code = _SQL_RISK_REQUIRES_TRUST_CODE
        self.message = message
        self.summary = message
        self.details = message
        self.data = data


class SqlRiskOperationDeniedError(RuntimeError):
    def __init__(self, *, source_id: str, step_id: str, data: dict[str, Any]):
        message = "SQL risk operation denied by trust policy."
        super().__init__(message)
        self.source_id = source_id
        self.step_id = step_id
        self.code = _SQL_RISK_DENIED_CODE
        self.message = message
        self.summary = message
        self.details = message
        self.data = data


def _normalize_connector_profile(args: dict[str, Any]) -> str:
    connector = args.get("connector")
    if not isinstance(connector, dict):
        return ""
    return str(connector.get("profile") or "").strip().lower()


def _resolve_sqlite_database_path(args: dict[str, Any]) -> str:
    credentials = args.get("credentials")
    if not isinstance(credentials, dict):
        return ""
    for key in ("database", "path"):
        value = credentials.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _evaluate_risk_operation_policy(
    *,
    profile: str,
    source: "SourceConfig",
    executor: "Executor",
) -> _SqlTrustBinding:
    target_type = "connector_profile"
    target_value = profile or "unknown"

    trust_policy = getattr(executor, "_network_trust_policy", None)
    if trust_policy is None or not hasattr(trust_policy, "evaluate"):
        return _SqlTrustBinding(
            target_type=target_type,
            target_value=target_value,
            decision=TrustDecision.PROMPT,
            decision_source="default",
        )

    resolution = trust_policy.evaluate(
        capability="sql",
        source_id=source.id,
        target_type=target_type,
        target_value=target_value,
    )
    if not isinstance(resolution, TrustResolution):
        return _SqlTrustBinding(
            target_type=target_type,
            target_value=target_value,
            decision=TrustDecision.PROMPT,
            decision_source="default",
        )
    return _SqlTrustBinding(
        target_type=target_type,
        target_value=target_value,
        decision=resolution.decision,
        decision_source=resolution.reason,
    )


def _build_risk_interaction_data(
    *,
    binding: _SqlTrustBinding,
    query_text: str,
    statement_types: list[str],
    risk_reasons: list[str],
) -> dict[str, Any]:
    preview = " ".join(str(query_text).split())
    if len(preview) > 120:
        preview = f"{preview[:120]}..."
    return {
        "confirm_kind": "network_trust",
        "capability": "sql",
        "target_type": binding.target_type,
        "target_value": binding.target_value,
        "target_key": binding.target_value,
        "decision_source": binding.decision_source,
        "statement_types": statement_types,
        "risk_reasons": risk_reasons,
        "query_preview": preview,
        "actions": ["allow_once", "allow_always", "deny"],
        "available_scopes": ["source", "global"],
    }


def _rows_from_cursor(cursor: sqlite3.Cursor) -> tuple[list[str], list[dict[str, Any]]]:
    if not cursor.description:
        return [], []

    columns = [str(meta[0]) for meta in cursor.description]
    rows: list[dict[str, Any]] = []
    for row in cursor.fetchall():
        rows.append(dict(zip(columns, row)))
    return columns, rows


async def execute_sql_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: dict[str, Any],
    context: dict[str, Any],
    outputs: dict[str, Any],
    executor: "Executor",
) -> dict[str, Any]:
    _ = (context, outputs)
    query_text = str(args.get("query") or "")
    classification = classify_sql_contract(query_text)
    statement_types = list(classification.statement_types)
    risk_reasons = list(classification.risk_reasons)
    profile = _normalize_connector_profile(args)

    if classification.requires_trust:
        binding = _evaluate_risk_operation_policy(
            profile=profile,
            source=source,
            executor=executor,
        )
        interaction_data = _build_risk_interaction_data(
            binding=binding,
            query_text=query_text,
            statement_types=statement_types,
            risk_reasons=risk_reasons,
        )
        if binding.decision == TrustDecision.PROMPT:
            raise SqlRiskOperationTrustRequiredError(
                source_id=source.id,
                step_id=step.id,
                data=interaction_data,
            )
        if binding.decision == TrustDecision.DENY:
            raise SqlRiskOperationDeniedError(
                source_id=source.id,
                step_id=step.id,
                data=interaction_data,
            )

    if profile != "sqlite":
        raise RuntimeError(f"Unsupported SQL connector profile: {profile or 'unknown'}")

    database_path = _resolve_sqlite_database_path(args)
    if not database_path:
        raise RuntimeError("Missing SQL credential field: credentials.database")

    with sqlite3.connect(database_path) as connection:
        cursor = connection.execute(query_text)
        columns, rows = _rows_from_cursor(cursor)
        connection.commit()

    return {
        "sql_response": {
            "rows": rows,
            "columns": columns,
            "row_count": len(rows),
            "statement_count": classification.statement_count,
            "statement_types": statement_types,
            "is_high_risk": classification.is_high_risk,
            "risk_reasons": risk_reasons,
        }
    }
