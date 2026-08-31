from dataclasses import dataclass

from .types import StructuralGrade


@dataclass(frozen=True, slots=True)
class XISignalsInput:
    attack_shape_delta: int
    creator_availability: int
    finisher_availability: int
    defensive_absence_over_impact: int
    rotation_risk: int
    cohesion_risk: int
    service_quality: int
    genuine_role_change: bool


@dataclass(frozen=True, slots=True)
class XIRerankResult:
    original_grade: StructuralGrade
    xi_grade: StructuralGrade
    band_delta: int
    signal_score: float
    reasons: tuple[str, ...]


GRADE_BANDS = [
    StructuralGrade.PASS,
    StructuralGrade.B,
    StructuralGrade.B_PLUS,
    StructuralGrade.A2,
    StructuralGrade.A1,
]


def rerank_xi(frozen_grade: StructuralGrade, signals: XISignalsInput) -> XIRerankResult:
    signal_score = (
        signals.attack_shape_delta
        + signals.creator_availability
        + signals.finisher_availability
        + signals.defensive_absence_over_impact
        + signals.service_quality
        - 1.5 * signals.rotation_risk
        - 1.5 * signals.cohesion_risk
    )
    reasons: list[str] = []
    if signals.rotation_risk:
        reasons.append(f"rotation risk {signals.rotation_risk}/2")
    if signals.cohesion_risk:
        reasons.append(f"cohesion risk {signals.cohesion_risk}/2")
    if signals.creator_availability > 0:
        reasons.append("creator availability improves the route")
    if signals.finisher_availability > 0:
        reasons.append("finisher availability improves the route")
    if signals.service_quality < 0:
        reasons.append("service quality weakens the attack")

    if signal_score <= -5:
        requested_delta = -2
    elif signal_score <= -1.5:
        requested_delta = -1
    elif signal_score >= 8 and signals.genuine_role_change:
        requested_delta = 2
        reasons.append("genuine role/shape change removes a known failure mode")
    elif signal_score >= 4:
        requested_delta = 1
    else:
        requested_delta = 0

    # Normal promotion is capped at one band. Two bands require an explicit genuine change.
    if requested_delta > 1 and not signals.genuine_role_change:
        requested_delta = 1
    original_index = GRADE_BANDS.index(frozen_grade)
    new_index = min(max(original_index + requested_delta, 0), len(GRADE_BANDS) - 1)
    applied_delta = new_index - original_index
    return XIRerankResult(
        original_grade=frozen_grade,
        xi_grade=GRADE_BANDS[new_index],
        band_delta=applied_delta,
        signal_score=round(signal_score, 2),
        reasons=tuple(reasons),
    )
