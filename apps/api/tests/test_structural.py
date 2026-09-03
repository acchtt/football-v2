from datetime import UTC, datetime

from app.football_engine.versions.v0_2_47_R import (
    AssessmentStatus,
    StructuralGrade,
    StructuralInput,
    assess_structural_fit,
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


def test_k_league_is_not_silently_hard_excluded() -> None:
    assessment = assess_structural_fit(
        candidate(competition="K-League 1", country_code="KR", carrier_ceiling=100)
    )
    assert assessment.status == AssessmentStatus.FROZEN
    assert assessment.grade in {StructuralGrade.A1, StructuralGrade.A2}
    assert assessment.display_on_board


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


def test_weak_chance_quality_is_a_modifier_not_a_blanket_grade_cap() -> None:
    assessment = assess_structural_fit(
        candidate(
            two_sided_strength=100,
            carrier_ceiling=95,
            profile_gate=95,
            chance_quality=50,
            failure_mode_resistance=95,
        )
    )
    assert assessment.grade == StructuralGrade.A1
    assert assessment.display_on_board


def test_incomplete_mandatory_profile_returns_hold_equivalent() -> None:
    assessment = assess_structural_fit(candidate(data_complete=False))
    assert assessment.status == AssessmentStatus.DATA_INCOMPLETE
    assert assessment.exclusion_reason == "MANDATORY_GF_GA_PROFILE_INCOMPLETE"
    assert assessment.grade == StructuralGrade.PASS


def test_frozen_evidence_records_active_pre_hardening_regime() -> None:
    assessment = assess_structural_fit(candidate())
    control = assessment.evidence["model_control"]
    assert control["version"] == "v0.2.47-R"
    assert control["regime"] == "PRE-HARDENING"
    assert control["recent_total_leakage_confirmation"] is True
    assert control["sep1_hardening"] is False
