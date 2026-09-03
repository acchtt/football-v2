import json
from decimal import Decimal
from pathlib import Path

import pytest

from app.football_engine.research.projection_reconstruction import (
    WeightedScoreScenario,
    calibrate_candidate_against_market,
    distribution_from_weighted_scores,
    scenarios_from_recovered_scores,
)
from app.model_state import get_model_state


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "projection_recovery_cases.json"


def load_recovery_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_recovered_projection_evidence_is_explicitly_unweighted() -> None:
    cases = load_recovery_cases()

    assert len(cases) >= 5
    assert len({case["case_id"] for case in cases}) == len(cases)

    for case in cases:
        assert case["source_record_id"]
        assert case["expected_total_range"]
        assert case["primary_scores"]
        assert "weight" not in case
        assert "probabilities" not in case
        assert "poisson" not in str(case).lower()


def test_weighted_scores_aggregate_only_explicit_probability_mass() -> None:
    scenarios = (
        WeightedScoreScenario(2, 1, Decimal("1")),
        WeightedScoreScenario(3, 1, Decimal("1")),
        WeightedScoreScenario(2, 2, Decimal("1")),
        WeightedScoreScenario(3, 2, Decimal("0.5"), label="upside"),
    )

    distribution = distribution_from_weighted_scores(scenarios)

    assert distribution == {
        3: Decimal("1") / Decimal("3.5"),
        4: Decimal("2") / Decimal("3.5"),
        5: Decimal("0.5") / Decimal("3.5"),
    }


def test_recovered_scores_require_caller_supplied_weights() -> None:
    with pytest.raises(ValueError, match="upside_weight is required"):
        scenarios_from_recovered_scores(
            [[1, 1], [2, 1]],
            primary_weight="1",
            upside_scores=[[2, 2]],
        )


def test_calibration_applies_canonical_price_floor_before_ev_diagnostics() -> None:
    scenarios = scenarios_from_recovered_scores(
        [[1, 1], [2, 1], [1, 2]],
        primary_weight="1",
    )
    minimum_price = get_model_state().market.minimum_price

    result = calibrate_candidate_against_market(
        scenarios,
        [[2.5, 1.69], [2.75, 1.89], [3.0, 2.16], [3.25, 2.42]],
        selected_line=2.75,
        selected_odds=1.89,
        minimum_price=minimum_price,
    )

    assert minimum_price == 1.70
    assert result.eligible_offer_count == 3
    assert result.selected_line == Decimal("2.75")
    assert result.selected_odds == Decimal("1.89")
    assert result.selected_ev_rank == 1


def test_calibration_rejects_historical_selection_below_price_floor() -> None:
    scenarios = scenarios_from_recovered_scores(
        [[1, 1], [2, 1]],
        primary_weight="1",
    )

    with pytest.raises(ValueError, match="Historical selected offer"):
        calibrate_candidate_against_market(
            scenarios,
            [[2.5, 1.69], [2.75, 1.89]],
            selected_line=2.5,
            selected_odds=1.69,
            minimum_price=1.70,
        )
