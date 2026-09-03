import json
from decimal import Decimal
from pathlib import Path

from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer
from app.football_engine.versions.v0_2_47_R.market_math import (
    projected_mean_goals,
    rank_over_offers,
)
from app.football_engine.versions.v0_2_47_R.scenario_distribution import (
    build_scenario_distribution,
)


FIXTURE = Path(__file__).parent / "fixtures" / "projection_recovery_cases.json"
MINIMUM_PRICE = Decimal("1.70")


def _cases() -> list[dict]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_staged_method_keeps_all_recovered_projection_means_inside_recorded_bands() -> None:
    for case in _cases():
        result = build_scenario_distribution(
            case["primary_scores"],
            upside_scores=case["upside_scores"],
            activation_approved=True,
        )
        mean = projected_mean_goals(result.distribution)
        lower, upper = (Decimal(str(value)) for value in case["expected_total_range"])
        assert lower <= mean <= upper, (case["case_id"], mean, lower, upper)


def test_staged_method_reproduces_all_four_recovered_market_reference_top_ev_lines() -> None:
    market_cases = [case for case in _cases() if "market_reference" in case]
    assert len(market_cases) == 4

    for case in market_cases:
        result = build_scenario_distribution(
            case["primary_scores"],
            upside_scores=case["upside_scores"],
            activation_approved=True,
        )
        market = case["market_reference"]
        offers = tuple(
            OddsOffer(line=float(line), over_odds=float(odds), under_odds=0.0)
            for line, odds in market["offers"]
            if Decimal(str(odds)) >= MINIMUM_PRICE
        )
        ranked = rank_over_offers(result.distribution, offers)
        assert ranked, case["case_id"]
        assert ranked[0].line == Decimal(str(market["reference_line"])), case["case_id"]
        assert ranked[0].offered_odds == Decimal(str(market["reference_odds"])), case["case_id"]


def test_failed_hull_forecast_remains_reconstruction_evidence_not_validation() -> None:
    hull = next(case for case in _cases() if case["case_id"].startswith("HUL-MUN"))
    result = build_scenario_distribution(
        hull["primary_scores"],
        upside_scores=hull["upside_scores"],
        activation_approved=True,
    )

    assert set(result.distribution) == {2, 3, 4}
    assert "failed carrier forecast" in hull["evidence_note"].lower()
    assert result.production_ready is False
