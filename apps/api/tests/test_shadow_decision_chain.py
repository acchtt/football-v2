from decimal import Decimal

from app.football_engine.research.shadow_decision_chain import run_shadow_decision_chain
from app.football_engine.research.shadow_market_policy import ProtectionPosture


def test_shadow_chain_connects_context_anchor_envelope_and_exact_market_math() -> None:
    context = {
        "carrier_dependence": "high",
        "secondary_route_strength": "weak",
        "two_sided_strength": "weak",
        "suppression_risk": "high",
        "failure_mode_resistance": "medium",
    }
    distribution = {2: 0.10, 3: 0.45, 4: 0.30, 5: 0.15}
    result = run_shadow_decision_chain(
        context=context,
        anchor_goal=3,
        goal_distribution=distribution,
        offers=[(2.5, 1.69), (2.75, 1.89), (3.0, 2.16), (3.25, 2.42)],
    )

    assert result.posture == ProtectionPosture.PROTECTION_HEAVY
    assert [(float(item.line), float(item.odds)) for item in result.candidates] == [(2.75, 1.89)]
    assert result.projected_mean_goals == Decimal("3.5")
    assert result.official_selection is None
    assert result.production_ready is False


def test_top_ev_remains_diagnostic_when_multiple_offers_survive() -> None:
    context = {
        "carrier_dependence": "low",
        "secondary_route_strength": "credible",
        "two_sided_strength": "credible",
        "suppression_risk": "low",
        "failure_mode_resistance": "high",
    }
    result = run_shadow_decision_chain(
        context=context,
        anchor_goal=3,
        goal_distribution={2: 0.10, 3: 0.35, 4: 0.35, 5: 0.20},
        offers=[(2.75, 1.74), (3.0, 1.95), (3.25, 2.20)],
    )

    assert result.posture == ProtectionPosture.PRICE_TOLERANT
    assert len(result.candidates) >= 2
    assert result.top_ev_line is not None
    assert result.official_selection is None
    assert result.blocker == "RESEARCH_ONLY_END_TO_END_CHAIN_NOT_APPROVED"


def test_distribution_is_required_and_not_invented_by_shadow_chain() -> None:
    try:
        run_shadow_decision_chain(
            context={
                "carrier_dependence": "low",
                "secondary_route_strength": "credible",
                "two_sided_strength": "credible",
                "suppression_risk": "low",
                "failure_mode_resistance": "high",
            },
            anchor_goal=3,
            goal_distribution={},
            offers=[(2.75, 1.80), (3.0, 2.05)],
        )
    except ValueError as exc:
        assert "Goal distribution cannot be empty" in str(exc)
    else:
        raise AssertionError("shadow chain must not invent a missing goal distribution")
