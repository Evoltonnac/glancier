"""
Shared log redaction helpers for sensitive payloads and error reasons.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

REDACTED_MARKER = "[REDACTED]"
SENSITIVE_LOG_FIELDS = {
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "client_secret",
    "password",
    "passwd",
    "pwd",
    "code",
    "device_code",
}
_URL_CREDENTIALS_PATTERN = re.compile(
    r"(?i)\b([a-z][a-z0-9+\-.]*://[^/\s:@]+:)([^@/\s]+)(@)"
)


def redact_sensitive_fields(
    value: Any,
    *,
    sensitive_fields: set[str] | None = None,
) -> Any:
    """Recursively replace sensitive mapping values with deterministic marker."""
    fields = sensitive_fields or SENSITIVE_LOG_FIELDS

    if isinstance(value, Mapping):
        redacted: dict[Any, Any] = {}
        for key, item in value.items():
            normalized_key = str(key).strip().lower()
            if normalized_key in fields:
                redacted[key] = REDACTED_MARKER
            else:
                redacted[key] = redact_sensitive_fields(item, sensitive_fields=fields)
        return redacted

    if isinstance(value, list):
        return [redact_sensitive_fields(item, sensitive_fields=fields) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_sensitive_fields(item, sensitive_fields=fields) for item in value)
    if isinstance(value, set):
        return {redact_sensitive_fields(item, sensitive_fields=fields) for item in value}

    return value


def sanitize_log_reason(reason: Any, *, max_length: int = 240) -> str:
    """Collapse multiline errors and redact obvious key=value/token fragments."""
    text = str(reason).replace("\r", " ").replace("\n", " ").strip()
    if not text:
        return "unknown_error"

    text = _URL_CREDENTIALS_PATTERN.sub(rf"\1{REDACTED_MARKER}\3", text)

    for field in SENSITIVE_LOG_FIELDS:
        pattern = re.compile(
            rf"(?i)\b({re.escape(field)})\b\s*[:=]\s*([\"']?)([^\s,;\"']+)\2"
        )
        text = pattern.sub(rf"\1={REDACTED_MARKER}", text)

    if len(text) > max_length:
        return f"{text[:max_length]}..."
    return text
