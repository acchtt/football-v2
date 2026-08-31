import re

from .config import DEFAULT_CONFIG, StructuralConfig
from .types import (
    AssessmentStatus,
    StructuralAssessment,
    StructuralGrade,
    StructuralInput,
    StructuralType,
)


def _normalized(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def is_hard_excluded(competition: str, country_code: str) -> bool:
    """K League 1/2 are permanently excluded and cannot be rescued downstream."""
    normalized_competition = _normalized(competition)
    normalized_country = _normalized(country_code)
    return normalized_country in {"KR", "KOR", "SOUTH KOREA"} and normalized_competition.startswith(
        "K LEAGUE"
    )


def _structural_type(candidate: StructuralInput) -> StructuralType:
    if candidate.two_sided_strength >= 70 and (
        candidate.two_sided_strength >= candidate.carrier_ceiling - 2
    ):
        return StructuralType.TWO_SIDED
    if candidate.opponent_secondary_route >= 50:
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


def _cap_grade(grade: StructuralGrade, cap: StructuralGrade) -> StructuralGrade:
    order = {
        StructuralGrade.PASS: 0,
        StructuralGrade.B: 1,
        StructuralGrade.B_PLUS: 2,
        StructuralGrade.A2: 3,
        StructuralGrade.A1: 4,
    }
    return grade if order[grade] <= order[cap] else cap


def assess_structural_fit(
    candidate: StructuralInput,
    config: StructuralConfig = DEFAULT_CONFIG,
) -> StructuralAssessment:
    structural_type = _structural_type(candidate)
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
    }

    if is_hard_excluded(candidate.competition, candidate.country_code):
        return StructuralAssessment(
            grade=StructuralGrade.PASS,
            structural_type=structural_type,
            score=0.0,
            status=AssessmentStatus.EXCLUDED,
            display_on_board=False,
            failure_modes=candidate.failure_modes,
            evidence=evidence,
            exclusion_reason="PERMANENT_COMPETITION_EXCLUSION",
        )

    if not candidate.data_complete:
        return StructuralAssessment(
            grade=StructuralGrade.PASS,
            structural_type=structural_type,
            score=0.0,
            status=AssessmentStatus.DATA_INCOMPLETE,
            display_on_board=False,
            failure_modes=candidate.failure_modes,
            evidence=evidence,
            exclusion_reason="REQUIRED_EVIDENCE_INCOMPLETE",
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

    mandatory_gates = (
        candidate.profile_gate,
        candidate.chance_quality,
        candidate.failure_mode_resistance,
    )
    if min(mandatory_gates) < config.mandatory_gate_floor:
        grade = _cap_grade(grade, StructuralGrade.B)
    elif (
        candidate.profile_gate < config.a1_min_profile
        or candidate.chance_quality < config.a1_min_chance_quality
        or candidate.failure_mode_resistance < config.a1_min_failure_resistance
    ):
        grade = _cap_grade(grade, StructuralGrade.A2)

    display_on_board = grade in {
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
