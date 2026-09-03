from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer, select_protected_line
from app.football_engine.versions.v0_2_47_R.types import StructuralGrade
from app.football_engine.versions.v0_2_47_R.verdict import VerdictInput, decide
from app.football_engine.versions.v0_2_47_R.xi_rerank import XISignalsInput, rerank_xi


def signals(**overrides: int | bool) -> XISignalsInput:
    values: dict[str, int | bool] = {
        "attack_shape_delta": 0,
        "creator_availability": 0,
        "finisher_availability": 0,
        "defensive_absence_over_impact": 0,
        "rotation_risk": 0,
        "cohesion_risk": 0,
        "service_quality": 0,
        "genuine_role_change": False,
    }
    values.update(overrides)
    return XISignalsInput(**values)  # type: ignore[arg-type]


def test_normal_xi_promotion_is_capped_at_one_band() -> None:
    result = rerank_xi(
        StructuralGrade.B,
        signals(
            attack_shape_delta=2,
            creator_availability=2,
            finisher_availability=2,
            defensive_absence_over_impact=2,
            service_quality=2,
        ),
    )
    assert result.xi_grade == StructuralGrade.B_PLUS
    assert result.band_delta == 1


def test_genuine_role_change_can_remove_failure_mode_for_two_band_promotion() -> None:
    result = rerank_xi(
        StructuralGrade.B_PLUS,
        signals(
            attack_shape_delta=2,
            creator_availability=2,
            finisher_availability=2,
            defensive_absence_over_impact=2,
            service_quality=2,
            genuine_role_change=True,
        ),
    )
    assert result.xi_grade == StructuralGrade.A1
    assert result.band_delta == 2


def test_protected_line_wins_over_small_price_improvement() -> None:
    result = select_protected_line(
        StructuralGrade.A1,
        structural_score=90,
        xi_band_delta=0,
        offers=(
            OddsOffer(2.75, 1.72, 2.02),
            OddsOffer(3.0, 1.86, 1.88),
            OddsOffer(3.25, 2.02, 1.74),
        ),
    )
    assert result.selected == OddsOffer(2.75, 1.72, 2.02)


def test_stretched_only_market_forces_hold() -> None:
    result = decide(
        VerdictInput(
            frozen_grade=StructuralGrade.A2,
            structural_score=78,
            profile_gate_score=80,
            chance_quality_score=80,
            frozen_failure_modes=(),
            lineup_confidence=0.95,
            odds_confidence=0.95,
            screenshots_match_fixture=True,
            xi_signals=signals(),
            odds_offers=(OddsOffer(3.25, 1.75, 2.05),),
        )
    )
    assert result.verdict == "NO BET — HOLD"
    assert result.selected_line is None


def test_heavy_rotation_holds_through_xi_downgrade_not_blanket_prohibition() -> None:
    result = decide(
        VerdictInput(
            frozen_grade=StructuralGrade.A1,
            structural_score=89,
            profile_gate_score=86,
            chance_quality_score=84,
            frozen_failure_modes=(),
            lineup_confidence=0.96,
            odds_confidence=0.96,
            screenshots_match_fixture=True,
            xi_signals=signals(rotation_risk=2, cohesion_risk=2),
            odds_offers=(OddsOffer(2.75, 1.78, 2.02),),
        )
    )
    assert result.verdict == "NO BET — HOLD"
    assert result.xi_grade == StructuralGrade.B_PLUS
    assert result.failure_modes_acceptable
