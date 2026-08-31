from dataclasses import dataclass

from .xi_rerank import XISignalsInput


@dataclass(frozen=True, slots=True)
class FailureModeResult:
    acceptable: bool
    reasons: tuple[str, ...]


def evaluate_xi_failure_modes(
    signals: XISignalsInput,
    frozen_failure_modes: tuple[str, ...],
) -> FailureModeResult:
    blockers: list[str] = []
    if signals.rotation_risk >= 2:
        blockers.append("heavy rotation creates excessive role uncertainty")
    if signals.cohesion_risk >= 2:
        blockers.append("lineup cohesion risk is too high")
    if signals.service_quality <= -2:
        blockers.append("attacking names are present without adequate service quality")
    if signals.attack_shape_delta <= -2:
        blockers.append("confirmed shape materially suppresses the Over route")
    if frozen_failure_modes and not blockers:
        blockers.append("frozen failure modes remain monitored but acceptable")
    return FailureModeResult(
        acceptable=not any(
            reason for reason in blockers if "remain monitored but acceptable" not in reason
        ),
        reasons=tuple(blockers),
    )
