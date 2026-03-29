from __future__ import annotations

from threading import RLock
from typing import Callable, Protocol

from .models import ConnectionTrustRule, TrustDecision, TrustResolution, TrustScopeType

_DEFAULT_POLICY = TrustDecision.PROMPT
_VALID_DEFAULT_POLICIES = {item.value for item in TrustDecision}


class TrustRuleRepository(Protocol):
    def find_rule(
        self,
        *,
        capability: str,
        scope_type: str,
        source_id: str | None,
        target_type: str,
        target_value: str,
    ) -> ConnectionTrustRule | None: ...


class NetworkTrustPolicy:
    def __init__(
        self,
        *,
        rule_repository: TrustRuleRepository,
        default_policy_resolver: Callable[[], str] | None = None,
    ):
        self._rule_repository = rule_repository
        self._default_policy_resolver = default_policy_resolver
        self._ephemeral_allow_once: set[tuple[str, str, str, str]] = set()
        self._ephemeral_lock = RLock()

    @staticmethod
    def normalize_default_policy(value: object) -> TrustDecision:
        if isinstance(value, TrustDecision):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in _VALID_DEFAULT_POLICIES:
                return TrustDecision(normalized)
        return _DEFAULT_POLICY

    def resolve_default_policy(self) -> TrustDecision:
        if self._default_policy_resolver is None:
            return _DEFAULT_POLICY
        try:
            return self.normalize_default_policy(self._default_policy_resolver())
        except Exception:
            return _DEFAULT_POLICY

    def grant_allow_once(
        self,
        *,
        capability: str,
        source_id: str,
        target_type: str,
        target_value: str,
    ) -> None:
        key = self._build_ephemeral_key(
            capability=capability,
            source_id=source_id,
            target_type=target_type,
            target_value=target_value,
        )
        with self._ephemeral_lock:
            self._ephemeral_allow_once.add(key)

    def evaluate(
        self,
        *,
        capability: str,
        source_id: str,
        target_type: str,
        target_value: str,
    ) -> TrustResolution:
        if self._has_allow_once(
            capability=capability,
            source_id=source_id,
            target_type=target_type,
            target_value=target_value,
        ):
            return TrustResolution(decision=TrustDecision.ALLOW, reason="allow_once")

        source_rule = self._rule_repository.find_rule(
            capability=capability,
            scope_type=TrustScopeType.SOURCE.value,
            source_id=source_id,
            target_type=target_type,
            target_value=target_value,
        )
        if source_rule is not None:
            return TrustResolution(
                decision=TrustDecision(source_rule.decision.value),
                reason="source_rule",
                rule=source_rule,
            )

        global_rule = self._rule_repository.find_rule(
            capability=capability,
            scope_type=TrustScopeType.GLOBAL.value,
            source_id=None,
            target_type=target_type,
            target_value=target_value,
        )
        if global_rule is not None:
            return TrustResolution(
                decision=TrustDecision(global_rule.decision.value),
                reason="global_rule",
                rule=global_rule,
            )

        return TrustResolution(
            decision=self.resolve_default_policy(),
            reason="default",
        )

    def clear_allow_once_for_source(self, *, source_id: str) -> None:
        normalized_source_id = source_id.strip()
        if not normalized_source_id:
            return
        with self._ephemeral_lock:
            self._ephemeral_allow_once = {
                key for key in self._ephemeral_allow_once if key[1] != normalized_source_id
            }

    def _has_allow_once(
        self,
        *,
        capability: str,
        source_id: str,
        target_type: str,
        target_value: str,
    ) -> bool:
        key = self._build_ephemeral_key(
            capability=capability,
            source_id=source_id,
            target_type=target_type,
            target_value=target_value,
        )
        with self._ephemeral_lock:
            return key in self._ephemeral_allow_once

    @staticmethod
    def _build_ephemeral_key(
        *,
        capability: str,
        source_id: str,
        target_type: str,
        target_value: str,
    ) -> tuple[str, str, str, str]:
        return (
            capability.strip().lower(),
            source_id.strip(),
            target_type.strip().lower(),
            target_value.strip().lower(),
        )
