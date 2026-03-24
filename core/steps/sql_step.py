"""SQL step runtime execution."""

from __future__ import annotations

import asyncio
import sqlite3
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from core.log_redaction import sanitize_log_reason
from core.network_trust.models import TrustDecision, TrustResolution
from core.sql.contracts import SqlContractValidationError, classify_sql_contract
from core.sql.normalization import build_normalized_sql_response, build_sql_fields
from core.sql.runtime_adapters import run_sql_query_for_profile

if TYPE_CHECKING:
    from core.config_loader import SourceConfig, StepConfig
    from core.executor import Executor


_DEFAULT_SQL_TIMEOUT_SECONDS = 30.0
_DEFAULT_SQL_MAX_ROWS = 500
_MIN_SQL_TIMEOUT_SECONDS = 0.1
_MIN_SQL_MAX_ROWS = 1
_MAX_SQL_TIMEOUT_SECONDS = 300.0
_MAX_SQL_MAX_ROWS = 10000
_MAX_QUERY_PREVIEW_LENGTH = 120
_REQUIRED_SQL_RESPONSE_KEYS = (
    "rows",
    "fields",
    "row_count",
    "duration_ms",
    "truncated",
    "statement_count",
    "statement_types",
    "is_high_risk",
    "risk_reasons",
    "timeout_seconds",
    "max_rows",
    "columns",
    "execution_ms",
)


@dataclass(slots=True)
class _SqlTrustBinding:
    target_type: str
    target_value: str
    decision: TrustDecision
    decision_source: str


class SqlStepRuntimeError(RuntimeError):
    def __init__(
        self,
        *,
        source_id: str,
        step_id: str,
        code: str,
        summary: str,
        details: str,
        data: dict[str, Any] | None = None,
    ):
        super().__init__(summary)
        self.source_id = source_id
        self.step_id = step_id
        self.code = code
        self.message = summary
        self.summary = summary
        self.details = details
        self.data = data or {}


class SqlInvalidContractError(SqlStepRuntimeError):
    pass


class SqlRiskOperationTrustRequiredError(SqlStepRuntimeError):
    pass


class SqlRiskOperationDeniedError(SqlStepRuntimeError):
    pass


class SqlConnectFailedError(SqlStepRuntimeError):
    pass


class SqlAuthFailedError(SqlStepRuntimeError):
    pass


class SqlQueryFailedError(SqlStepRuntimeError):
    pass


class SqlTimeoutError(SqlStepRuntimeError):
    pass


class SqlRowLimitExceededError(SqlStepRuntimeError):
    pass


def _normalize_connector_profile(args: dict[str, Any]) -> str:
    connector = args.get("connector")
    if not isinstance(connector, dict):
        return ""
    return str(connector.get("profile") or "").strip().lower()


def _resolve_sql_dialect(args: dict[str, Any]) -> str | None:
    connector = args.get("connector")
    if not isinstance(connector, dict):
        return None
    options = connector.get("options")
    if not isinstance(options, dict):
        return None
    dialect = options.get("dialect")
    if not isinstance(dialect, str):
        return None
    normalized = dialect.strip().lower()
    return normalized or None


def _resolve_sql_runtime_defaults(executor: "Executor") -> tuple[float, int]:
    settings_manager = getattr(executor, "_settings_manager", None)
    if settings_manager is None:
        return _DEFAULT_SQL_TIMEOUT_SECONDS, _DEFAULT_SQL_MAX_ROWS
    try:
        settings = settings_manager.load_settings()
    except Exception:
        return _DEFAULT_SQL_TIMEOUT_SECONDS, _DEFAULT_SQL_MAX_ROWS

    raw_timeout = getattr(settings, "sql_default_timeout_seconds", _DEFAULT_SQL_TIMEOUT_SECONDS)
    raw_max_rows = getattr(settings, "sql_default_max_rows", _DEFAULT_SQL_MAX_ROWS)

    try:
        timeout_seconds = float(raw_timeout)
    except (TypeError, ValueError):
        timeout_seconds = _DEFAULT_SQL_TIMEOUT_SECONDS
    if timeout_seconds < _MIN_SQL_TIMEOUT_SECONDS or timeout_seconds > _MAX_SQL_TIMEOUT_SECONDS:
        timeout_seconds = _DEFAULT_SQL_TIMEOUT_SECONDS

    try:
        max_rows = int(raw_max_rows)
    except (TypeError, ValueError):
        max_rows = _DEFAULT_SQL_MAX_ROWS
    if max_rows < _MIN_SQL_MAX_ROWS or max_rows > _MAX_SQL_MAX_ROWS:
        max_rows = _DEFAULT_SQL_MAX_ROWS

    return timeout_seconds, max_rows


def _resolve_sql_timeout(args: dict[str, Any], *, default_timeout_seconds: float) -> float:
    if "timeout" not in args or args.get("timeout") is None:
        raw_value = default_timeout_seconds
    else:
        raw_value = args.get("timeout")
    try:
        timeout_seconds = float(raw_value)
    except (TypeError, ValueError):
        return default_timeout_seconds
    return max(timeout_seconds, _MIN_SQL_TIMEOUT_SECONDS)


def _resolve_sql_max_rows(args: dict[str, Any], *, default_max_rows: int) -> int:
    if "max_rows" not in args or args.get("max_rows") is None:
        raw_value = default_max_rows
    else:
        raw_value = args.get("max_rows")
    try:
        max_rows = int(raw_value)
    except (TypeError, ValueError):
        return default_max_rows
    return max(max_rows, _MIN_SQL_MAX_ROWS)


def _is_auth_failure_message(message: str) -> bool:
    lowered = message.lower()
    return any(token in lowered for token in ("auth", "password", "credential", "permission denied"))


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
    if len(preview) > _MAX_QUERY_PREVIEW_LENGTH:
        preview = f"{preview[:_MAX_QUERY_PREVIEW_LENGTH]}..."
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


def _map_connect_error(
    *,
    source_id: str,
    step_id: str,
    reason: Exception,
) -> SqlStepRuntimeError:
    reason_text = sanitize_log_reason(reason)
    if _is_auth_failure_message(reason_text):
        return SqlAuthFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.sql_auth_failed",
            summary="SQL authentication failed.",
            details=reason_text,
        )
    return SqlConnectFailedError(
        source_id=source_id,
        step_id=step_id,
        code="runtime.sql_connect_failed",
        summary="SQL connection failed.",
        details=reason_text,
    )


def _map_query_error(
    *,
    source_id: str,
    step_id: str,
    reason: Exception,
) -> SqlQueryFailedError:
    return SqlQueryFailedError(
        source_id=source_id,
        step_id=step_id,
        code="runtime.sql_query_failed",
        summary="SQL query execution failed.",
        details=sanitize_log_reason(reason),
    )


def _is_connect_failure_message(message: str) -> bool:
    lowered = message.lower()
    return any(
        token in lowered
        for token in (
            "unsupported sql connector profile",
            "missing sql credential field",
            "unable to open database file",
            "could not connect",
            "connection refused",
            "connection reset",
            "name or service not known",
            "network is unreachable",
            "failed to resolve",
        )
    )


def _map_runtime_adapter_error(
    *,
    source_id: str,
    step_id: str,
    reason: Exception,
) -> SqlStepRuntimeError:
    reason_text = sanitize_log_reason(reason)
    if _is_auth_failure_message(reason_text):
        return _map_connect_error(source_id=source_id, step_id=step_id, reason=reason)

    if isinstance(reason, (ConnectionError, TimeoutError, sqlite3.InterfaceError)):
        return _map_connect_error(source_id=source_id, step_id=step_id, reason=reason)
    if isinstance(reason, sqlite3.DatabaseError):
        if _is_connect_failure_message(reason_text):
            return _map_connect_error(source_id=source_id, step_id=step_id, reason=reason)
        return _map_query_error(source_id=source_id, step_id=step_id, reason=reason)
    if _is_connect_failure_message(reason_text):
        return _map_connect_error(source_id=source_id, step_id=step_id, reason=reason)
    return _map_query_error(source_id=source_id, step_id=step_id, reason=reason)


def _validate_sql_response_contract(
    *,
    source_id: str,
    step_id: str,
    sql_response: dict[str, Any],
) -> None:
    missing_keys = [key for key in _REQUIRED_SQL_RESPONSE_KEYS if key not in sql_response]
    if missing_keys:
        raise SqlQueryFailedError(
            source_id=source_id,
            step_id=step_id,
            code="runtime.sql_query_failed",
            summary="SQL query execution failed.",
            details=f"Normalized SQL response missing keys: {', '.join(sorted(missing_keys))}",
        )


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
    dialect = _resolve_sql_dialect(args)
    try:
        classification = classify_sql_contract(query_text, dialect=dialect)
    except SqlContractValidationError as error:
        raise SqlInvalidContractError(
            source_id=source.id,
            step_id=step.id,
            code=error.code,
            summary=error.summary,
            details=error.details,
        ) from error

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
                code="runtime.sql_risk_operation_requires_trust",
                summary="SQL risk operation requires trust confirmation.",
                details="Confirm this high-risk SQL operation before execution.",
                data=interaction_data,
            )
        if binding.decision == TrustDecision.DENY:
            raise SqlRiskOperationDeniedError(
                source_id=source.id,
                step_id=step.id,
                code="runtime.sql_risk_operation_denied",
                summary="SQL risk operation denied by trust policy.",
                details="Trust policy denied this high-risk SQL operation.",
                data=interaction_data,
            )

    if profile not in {"sqlite", "postgresql"}:
        raise SqlConnectFailedError(
            source_id=source.id,
            step_id=step.id,
            code="runtime.sql_connect_failed",
            summary="SQL connection failed.",
            details=f"Unsupported SQL connector profile: {profile or 'unknown'}",
        )

    default_timeout_seconds, default_max_rows = _resolve_sql_runtime_defaults(executor)
    timeout_seconds = _resolve_sql_timeout(args, default_timeout_seconds=default_timeout_seconds)
    max_rows = _resolve_sql_max_rows(args, default_max_rows=default_max_rows)
    credentials = args.get("credentials")
    if not isinstance(credentials, dict):
        credentials = {}

    started_at = time.monotonic()
    try:
        raw_payload = await asyncio.wait_for(
            asyncio.to_thread(
                run_sql_query_for_profile,
                profile,
                credentials=credentials,
                query_text=query_text,
                max_rows=max_rows,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as error:
        raise SqlTimeoutError(
            source_id=source.id,
            step_id=step.id,
            code="runtime.sql_timeout",
            summary="SQL query timed out.",
            details=f"Query exceeded timeout limit of {timeout_seconds:.3f} second(s).",
        ) from error
    except Exception as error:
        raise _map_runtime_adapter_error(
            source_id=source.id,
            step_id=step.id,
            reason=error,
        ) from error

    columns = raw_payload.get("columns")
    rows = raw_payload.get("rows")
    has_more_rows = bool(raw_payload.get("has_more_rows"))
    db_type_hints = raw_payload.get("db_type_hints")

    if not isinstance(columns, list):
        columns = []
    if not isinstance(rows, list):
        rows = []
    if not isinstance(db_type_hints, dict):
        db_type_hints = {}

    duration_ms = int((time.monotonic() - started_at) * 1000)
    fields = build_sql_fields(columns, rows, db_type_hints=db_type_hints)
    sql_response = build_normalized_sql_response(
        rows=rows,
        fields=fields,
        row_count=len(rows),
        duration_ms=duration_ms,
        truncated=has_more_rows,
        statement_count=classification.statement_count,
        statement_types=statement_types,
        is_high_risk=classification.is_high_risk,
        risk_reasons=risk_reasons,
        timeout_seconds=timeout_seconds,
        max_rows=max_rows,
    )
    _validate_sql_response_contract(
        source_id=source.id,
        step_id=step.id,
        sql_response=sql_response,
    )
    return {
        "sql_response": sql_response
    }
