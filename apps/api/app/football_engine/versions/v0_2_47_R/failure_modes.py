from dataclasses import dataclass

from app.model_state import get_model_state

from .xi_rerank import XISignalsInput


@dataclass(frozen=True, slots=True)
class FailureModeResult:
    acceptable: bool
    reasons: tuple[str, ...]


def evaluate_xi_failure_modes(
    signals: XISignalsInput,
    frozen_failure_modes: tuple[str, ...],
) -> FailureModeResult:
    state = get_model_state()
    observations: list[str] = []

    if signals.rotation_risk >= 2:
        observations.append("heavy rotation materially weakens route confidence")
    if signals.cohesion_risk >= 2:
        observations.append("lineup cohesion risk materially weakens route confidence")
    if signals.service_quality <= -2:
        observations.append("attacking personnel lack adequate service support")
    if signals.attack_shape_delta <= -2:
        observations.append("confirmed shape materially weakens the Over route")
    if frozen_failure_modes:
        observations.append("frozen failure modes remain active monitoring points")

    # PRE-HARDENING: XI failure observations feed the XI band adjustment and later
    # burden choice. They are not independent blanket route prohibitions.
    acceptable = not state.rules.deprecated_restrictions.xi_route_prohibitions
    return FailureModeResult(
        acceptable=acceptable,
        reasons=tuple(observations),
    )
