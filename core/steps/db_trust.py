from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from core.network_trust.database import (
    ClassifiedDatabaseTarget,
    classify_database_connection_target,
)
from core.network_trust.models import (
    NetworkTargetClass,
    NetworkTargetDeniedError,
    NetworkTrustRequiredError,
    TrustDecision,
    TrustResolution,
)

if TYPE_CHECKING:
    from core.config_loader import SourceConfig, StepConfig
    from core.executor import Executor


@dataclass(frozen=True, slots=True)
class TrustBinding:
    target_type: str
    target_value: str
    decision: TrustDecision
    decision_source: str


def evaluate_trust_binding(
    *,
    capability: str,
    source: "SourceConfig",
    executor: "Executor",
    target_type: str,
    target_value: str,
) -> TrustBinding:
    normalized_target_type = str(target_type or "").strip().lower()
    normalized_target_value = str(target_value or "").strip().lower()
    trust_policy = getattr(executor, "_network_trust_policy", None)
    if trust_policy is None or not hasattr(trust_policy, "evaluate"):
        return TrustBinding(
            target_type=normalized_target_type,
            target_value=normalized_target_value,
            decision=TrustDecision.PROMPT,
            decision_source="default",
        )

    resolution = trust_policy.evaluate(
        capability=capability,
        source_id=source.id,
        target_type=normalized_target_type,
        target_value=normalized_target_value,
    )
    if not isinstance(resolution, TrustResolution):
        return TrustBinding(
            target_type=normalized_target_type,
            target_value=normalized_target_value,
            decision=TrustDecision.PROMPT,
            decision_source="default",
        )
    return TrustBinding(
        target_type=normalized_target_type,
        target_value=normalized_target_value,
        decision=resolution.decision,
        decision_source=resolution.reason,
    )


def enforce_database_network_trust(
    *,
    capability: str,
    profile: str,
    connection_string: str,
    source: "SourceConfig",
    step: "StepConfig",
    executor: "Executor",
) -> ClassifiedDatabaseTarget | None:
    target = classify_database_connection_target(
        profile=profile,
        connection_string=connection_string,
    )
    if target is None:
        return None
    if target.target_class not in {NetworkTargetClass.PRIVATE, NetworkTargetClass.LOOPBACK}:
        return target

    binding = evaluate_trust_binding(
        capability=capability,
        source=source,
        executor=executor,
        target_type=target.target_type,
        target_value=target.target_value,
    )
    interaction_data = {
        "confirm_kind": "network_trust",
        "capability": capability,
        "profile": target.profile,
        "target_class": target.target_class.value,
        "target_type": target.target_type,
        "target_value": target.target_value,
        "target_key": target.target_value,
        "decision_source": binding.decision_source,
        "actions": ["allow_once", "allow_always", "deny"],
        "available_scopes": ["source", "global"],
    }
    if binding.decision == TrustDecision.PROMPT:
        raise NetworkTrustRequiredError(
            source_id=source.id,
            step_id=step.id,
            data=interaction_data,
        )
    if binding.decision == TrustDecision.DENY:
        raise NetworkTargetDeniedError(
            source_id=source.id,
            step_id=step.id,
            data=interaction_data,
        )
    return target
