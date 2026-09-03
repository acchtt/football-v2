import json
from pathlib import Path

from app.football_engine.research.protection_trade_recovery import (
    analyze_protection_trade_cases,
    settlement_at_anchor,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "protection_trade_cases.json"


def load_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_trade_evidence_is_sourced_and_probability_free() -> None:
    cases = load_cases()

    assert len(cases) >= 14
    assert len({case["case_id"] for case in cases}) == len(cases)
    for case in cases:
        assert case["source_reference"]
        assert case["context_tag"]
        assert "probability" not in str(case).lower()
        assert "poisson" not in str(case).lower()
        assert "fair_total" not in case
        assert float(case["higher_line"]) - float(case["lower_line"]) == 0.25


def test_anchor_settlement_categories_are_exact_for_adjacent_over_lines() -> None:
    assert settlement_at_anchor(anchor_goal=3, over_line=2.5) == "full_win"
    assert settlement_at_anchor(anchor_goal=3, over_line=2.75) == "half_win"
    assert settlement_at_anchor(anchor_goal=3, over_line=3.0) == "push"
    assert settlement_at_anchor(anchor_goal=3, over_line=3.25) == "half_loss"
    assert settlement_at_anchor(anchor_goal=3, over_line=3.5) == "full_loss"


def test_supporting_history_falsifies_a_fixed_price_gain_threshold() -> None:
    report = analyze_protection_trade_cases(load_cases())
    diagnostic = report.supporting_threshold_diagnostic

    assert diagnostic.sample_count == 5
    assert diagnostic.accepted_price_gains == (0.21, 0.22)
    assert diagnostic.rejected_price_gains == (0.2, 0.25, 0.26)
    assert diagnostic.minimum_accepted_gain == 0.21
    assert diagnostic.maximum_rejected_gain == 0.26
    assert diagnostic.fixed_threshold_possible is False
    assert "Context is therefore required" in diagnostic.explanation
    assert report.production_ready is False


def test_price_floor_elimination_is_separate_from_protection_trade() -> None:
    report = analyze_protection_trade_cases(load_cases())
    floor_cases = [
        observation
        for observation in report.observations
        if observation.decision_driver == "price_floor_elimination"
    ]

    assert report.floor_elimination_count == 2
    assert len(floor_cases) == 2
    assert all(observation.lower_eligible is False for observation in floor_cases)
    assert all(observation.higher_eligible is True for observation in floor_cases)


def test_america_acceptance_uses_floor_then_rejects_further_stretch() -> None:
    report = analyze_protection_trade_cases(load_cases())
    america = [
        observation
        for observation in report.observations
        if observation.case_id.startswith("AME-MTY-20260903")
    ]

    assert len(america) == 2
    floor = next(item for item in america if item.decision_driver == "price_floor_elimination")
    trade = next(item for item in america if item.decision_driver == "protection_vs_price")

    assert floor.lower_line == 2.5
    assert floor.lower_odds == 1.69
    assert floor.selected_direction == "higher"
    assert floor.higher_line == 2.75

    assert trade.lower_line == 2.75
    assert trade.higher_line == 3.0
    assert trade.price_gain == 0.27
    assert trade.lower_anchor_settlement == "half_win"
    assert trade.higher_anchor_settlement == "push"
    assert trade.selected_direction == "lower"
    assert trade.evidence_status == "acceptance_control"


def test_similar_price_gains_can_produce_opposite_choices() -> None:
    observations = {
        observation.case_id: observation
        for observation in analyze_protection_trade_cases(load_cases()).observations
    }
    koln = observations["KOE-HOF-20260829-275-300"]
    ipswich = observations["IPS-LEI-20260826-275-300"]

    assert koln.price_gain == 0.21
    assert koln.selected_direction == "higher"
    assert ipswich.price_gain == 0.25
    assert ipswich.selected_direction == "lower"
    assert koln.protection_steps_surrendered == 1
    assert ipswich.protection_steps_surrendered == 1


def test_negative_controls_do_not_enter_supporting_threshold_diagnostic() -> None:
    report = analyze_protection_trade_cases(load_cases())

    assert report.negative_control_count == 2
    supporting_ids = {
        observation.case_id
        for observation in report.observations
        if observation.evidence_status == "supporting_reconstruction"
        and observation.decision_driver == "protection_vs_price"
    }
    assert "MTA-LUG-20260827-275-300" not in supporting_ids
    assert "AUS-WSG-20260902-275-300" not in supporting_ids
    assert report.blocker == "RESEARCH_ONLY_PROTECTION_PRICE_POLICY_NOT_APPROVED"
