from dataclasses import dataclass

from app.model_state import get_model_state


@dataclass(frozen=True, slots=True)
class StructuralConfig:
    a1_min_score: float
    a2_min_score: float
    b_plus_min_score: float
    b_min_score: float
    board_min_score: float

    primary_route_weight: float
    profile_weight: float
    chance_quality_weight: float
    failure_resistance_weight: float

    two_sided_route_threshold: float
    two_sided_carrier_tolerance: float
    secondary_route_threshold: float


def _from_model_state() -> StructuralConfig:
    state = get_model_state().structural
    grades = state.grade_thresholds
    weights = state.weights
    return StructuralConfig(
        a1_min_score=grades["A1"],
        a2_min_score=grades["A2"],
        b_plus_min_score=grades["B+"],
        b_min_score=grades["B"],
        board_min_score=state.board_min_score,
        primary_route_weight=weights["primary_route"],
        profile_weight=weights["profile"],
        chance_quality_weight=weights["chance_quality"],
        failure_resistance_weight=weights["failure_resistance"],
        two_sided_route_threshold=state.two_sided_route_threshold,
        two_sided_carrier_tolerance=state.two_sided_carrier_tolerance,
        secondary_route_threshold=state.secondary_route_threshold,
    )


DEFAULT_CONFIG = _from_model_state()
