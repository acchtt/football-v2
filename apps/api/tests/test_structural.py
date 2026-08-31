from datetime import UTC, datetime

from app.football_engine.versions.v0_2_47_R import (
    AssessmentStatus,
    StructuralGrade,
    StructuralInput,
    assess_structural_fit,
    is_hard_excluded,
)


def candidate(**overrides: object) -> StructuralInput:
    values: dict[str, object] = {
        "provider_fixture_id": "test:1",
        "competition": "Premier League",
        "country_code": "GB-ENG",
        "home_team": "Home",
        "away_team": "Away",
        "kickoff_utc": datetime(2026, 8, 31, 12, tzinfo=UTC),
        "two_sided_strength": 90,
        "carrier_ceiling": 80,
        "opponent_secondary_route": 70,
        "failure_mode_resistance": 82,
        "profile_gate": 88,
        "chance_quality": 86,
        "data_complete": True,
    }
    values.update(overrides)
    return StructuralInput(**values)  # type: ignore[arg-type]


def test_k_league_is_always_excluded_even_with_elite_inputs() -> None:
    assessment = assess_structural_fit(
        candidate(competition="K-League 1", country_code="KR", carrier_ceiling=100)
    )
    assert is_hard_excluded("K League 2", "KOR")
    assert assessment.status == AssessmentStatus.EXCLUDED
    assert assessment.grade == StructuralGrade.PASS
    assert not assessment.display_on_board


def test_elite_carrier_can_be_a1_peer_without_opponent_scoring() -> None:
    assessment = assess_structural_fit(
        candidate(
            two_sided_strength=55,
            carrier_ceiling=98,
            opponent_secondary_route=25,
            profile_gate=92,
            chance_quality=91,
            failure_mode_resistance=82,
        )
    )
    assert assessment.grade == StructuralGrade.A1
    assert assessment.structural_type.value == "ELITE_CARRIER"


def test_weak_mandatory_profile_gate_caps_an_attractive_match() -> None:
    assessment = assess_structural_fit(
        candidate(profile_gate=50, two_sided_strength=100, chance_quality=98)
    )
    assert assessment.grade == StructuralGrade.B
    assert not assessment.display_on_board


def test_incomplete_required_data_returns_hold_equivalent() -> None:
    assessment = assess_structural_fit(candidate(data_complete=False))
    assert assessment.status == AssessmentStatus.DATA_INCOMPLETE
    assert assessment.exclusion_reason == "REQUIRED_EVIDENCE_INCOMPLETE"
    assert assessment.grade == StructuralGrade.PASS
