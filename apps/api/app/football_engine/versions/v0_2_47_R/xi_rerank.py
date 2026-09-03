from dataclasses import dataclass

from app.model_state import get_model_state

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
    state = get_model_state().xi
    signal_score = (
        signals.attack_shape_delta
        + signals.creator_availability
        + signals.finisher_availability
        + signals.defensive_absence_over_impact
        + signals.service_quality
        - state.rotation_penalty * signals.rotation_risk
        - state.cohesion_penalty * signals.cohesion_risk
    )
    reasons: list[str] = []
    if signals.rotation_risk:
        reasons.append(f"rotation risk {signals.rotation_risk}/2")
    if signals.cohesion_risk:
        reasons.append(f"cohesion risk {signals.cohesion_risk}/2")
    if signals.creator_availability > 0:
        reasons.append("creator availability improves the existing route")
    if signals.finisher_availability > 0:
        reasons.append("finisher availability improves the existing route")
    if signals.service_quality < 0:
        reasons.append("service quality weakens the attack")

    if signal_score <= state.two_band_downgrade_threshold:
        requested_delta = -2
    elif signal_score <= state.one_band_downgrade_threshold:
        requested_delta = -1
    elif signal_score >= state.two_band_upgrade_threshold and signals.genuine_role_change:
        requested_delta = 2
        reasons.append("genuine role/shape change removes a known failure mode")
    elif signal_score >= state.one_band_upgrade_threshold:
        requested_delta = 1
    else:
        requested_delta = 0

    if requested_delta > state.normal_promotion_cap_bands:
        if state.two_band_upgrade_requires_genuine_role_change and not signals.genuine_role_change:
            requested_delta = state.normal_promotion_cap_bands

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
