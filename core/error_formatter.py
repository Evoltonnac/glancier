"""
Canonical runtime/API error formatter.
"""

from __future__ import annotations

import traceback
from typing import TypedDict

_DEFAULT_ERROR_CODE = "runtime.unexpected_error"
_DEFAULT_ERROR_SUMMARY = "Unexpected runtime error"


class ErrorEnvelope(TypedDict, total=False):
    code: str
    summary: str
    details: str
    step_id: str


def _normalize_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text if text else None


def build_error_envelope(
    *,
    code: str,
    summary: str,
    details: str | None = None,
    step_id: str | None = None,
) -> ErrorEnvelope:
    normalized_code = _normalize_text(code) or _DEFAULT_ERROR_CODE
    normalized_summary = _normalize_text(summary) or _DEFAULT_ERROR_SUMMARY
    normalized_details = _normalize_text(details) or normalized_summary

    envelope: ErrorEnvelope = {
        "code": normalized_code,
        "summary": normalized_summary,
        "details": normalized_details,
    }
    normalized_step_id = _normalize_text(step_id)
    if normalized_step_id:
        envelope["step_id"] = normalized_step_id
    return envelope


def format_runtime_error(
    error: Exception,
    *,
    default_code: str = "runtime.fetch_failed",
    default_summary: str = "Fetch failed",
    include_traceback: bool = False,
) -> ErrorEnvelope:
    code = _normalize_text(getattr(error, "code", None)) or default_code
    summary = (
        _normalize_text(getattr(error, "summary", None))
        or _normalize_text(str(error))
        or default_summary
    )
    details = _normalize_text(getattr(error, "details", None)) or summary
    step_id = _normalize_text(getattr(error, "step_id", None))

    if include_traceback:
        trace_text = traceback.format_exc().strip()
        if trace_text and trace_text != "NoneType: None" and "Raw traceback:" not in details:
            details = f"{details}\n\nRaw traceback:\n{trace_text}"

    return build_error_envelope(
        code=code,
        summary=summary,
        details=details,
        step_id=step_id,
    )
