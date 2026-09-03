from app.model_state import get_model_state

from .config import DEFAULT_CONFIG, StructuralConfig
from .types import (
    AssessmentStatus,
    StructuralAssessment,
    StructuralGrade,
    StructuralInput,
    StructuralType,
)


def _structural_type(candidate: StructuralInput, config: StructuralConfig) -> StructuralType:
    if candidate.two_sided_strength >= config.two_sided_route_threshold and (
        candidate.two_sided_strength
        >= candidate.carrier_ceiling - config.two_sided_carrier_tolerance
    ):
        return StructuralType.TWO_SIDED
    if candidate.opponent_secondary_route >= config.secondary_route_threshold:
        return StructuralType.CARRIER_SECONDARY_ROUTE
    return StructuralType.ELITE_CARRIER


def _grade(score: float, config: StructuralConfig) -> StructuralGrade:
    if score >= config.a1_min_score:
        return StructuralGrade.A1
    if score >= config.a2_min_score:
        return StructuralGrade.A2
    if score >= config.b_plus_min_score:
        return StructuralGrade.B_PLUS
    if score >= config.b_min_score:
        return StructuralGrade.B
    return StructuralGrade.PASS


def assess_structural_fit(
    candidate: StructuralInput,
    config: StructuralConfig = DEFAULT_CONFIG,
) -> StructuralAssessment:
    state = get_model_state()
    structural_type = _structural_type(candidate, config)
    evidence = {
        **candidate.evidence,
        "inputs": {
            "two_sided_strength": candidate.two_sided_strength,
            "carrier_ceiling": candidate.carrier_ceiling,
            "opponent_secondary_route": candidate.opponent_secondary_route,
            "failure_mode_resistance": candidate.failure_mode_resistance,
            "profile_gate": candidate.profile_gate,
            "chance_quality": candidate.chance_quality,
        },
        "source_metadata": dict(candidate.source_metadata),
        "model_control": {
            "version": state.model.version,
            "regime": state.model.regime,
            "recent_total_leakage_confirmation": state.rules.recent_total_leakage_confirmation,
            "sep1_hardening": state.rules.sep1_hardening,
        },
    }

    if not candidate.data_complete:
        return StructuralAssessment(
            grade=StructuralGrade.PASS,
            structural_type=structural_type,
            score=0.0,
            status=AssessmentStatus.DATA_INCOMPLETE,
            display_on_board=False,
            failure_modes=candidate.failure_modes,
            evidence=evidence,
            exclusion_reason="MANDATORY_GF_GA_PROFILE_INCOMPLETE",
        )

    primary_route = max(candidate.two_sided_strength, candidate.carrier_ceiling)
    score = round(
        primary_route * config.primary_route_weight
        + candidate.profile_gate * config.profile_weight
        + candidate.chance_quality * config.chance_quality_weight
        + candidate.failure_mode_resistance * config.failure_resistance_weight,
        2,
    )
    grade = _grade(score, config)

    # PRE-HARDENING: chance quality, profile quality, and failure resistance are
    # weighted evidence. They do not independently impose blanket grade caps.
    display_on_board = score >= config.board_min_score and grade in {
        StructuralGrade.A1,
        StructuralGrade.A2,
        StructuralGrade.B_PLUS,
    }
    return StructuralAssessment(
        grade=grade,
        structural_type=structural_type,
        score=score,
        status=AssessmentStatus.FROZEN if display_on_board else AssessmentStatus.EXCLUDED,
        display_on_board=display_on_board,
        failure_modes=candidate.failure_modes,
        evidence=evidence,
        exclusion_reason=None if display_on_board else "BELOW_BOARD_THRESHOLD",
    )
