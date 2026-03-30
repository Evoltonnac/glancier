from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class TrustScopeType(str, Enum):
    SOURCE = "source"
    GLOBAL = "global"


class TrustDecision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    PROMPT = "prompt"


class PersistedTrustDecision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"


class NetworkTargetClass(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    LOOPBACK = "loopback"


@dataclass(frozen=True, slots=True)
class ClassifiedNetworkTarget:
    scheme: str
    host: str
    port: int | None
    target_type: str
    target_value: str
    target_class: NetworkTargetClass
    url: str


@dataclass(frozen=True, slots=True)
class ConnectionTrustRule:
    rule_id: int
    capability: str
    scope_type: TrustScopeType
    source_id: str | None
    target_type: str
    target_value: str
    decision: PersistedTrustDecision
    created_at: float
    updated_at: float
    expires_at: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class TrustResolution:
    decision: TrustDecision
    reason: str
    rule: ConnectionTrustRule | None = None


class NetworkTrustRuntimeError(RuntimeError):
    def __init__(
        self,
        *,
        source_id: str,
        step_id: str | None,
        code: str,
        message: str,
        data: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.source_id = source_id
        self.step_id = step_id
        self.code = code
        self.message = message
        self.data = data or {}


class NetworkTrustRequiredError(NetworkTrustRuntimeError):
    def __init__(
        self,
        *,
        source_id: str,
        step_id: str | None,
        data: dict[str, Any],
        message: str = "Network trust decision required for private target.",
    ):
        super().__init__(
            source_id=source_id,
            step_id=step_id,
            code="runtime.network_trust_required",
            message=message,
            data=data,
        )


class NetworkTargetDeniedError(NetworkTrustRuntimeError):
    def __init__(
        self,
        *,
        source_id: str,
        step_id: str | None,
        data: dict[str, Any],
        message: str = "Network target denied by trust policy.",
    ):
        super().__init__(
            source_id=source_id,
            step_id=step_id,
            code="runtime.network_target_denied",
            message=message,
            data=data,
        )


class NetworkTargetInvalidError(NetworkTrustRuntimeError):
    def __init__(
        self,
        *,
        source_id: str,
        step_id: str | None,
        data: dict[str, Any],
        message: str = "Invalid HTTP target URL.",
    ):
        super().__init__(
            source_id=source_id,
            step_id=step_id,
            code="runtime.network_target_invalid",
            message=message,
            data=data,
        )
