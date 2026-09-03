import json
from pathlib import Path

from app.football_engine.research.protection_context_recovery import (
    analyze_protection_context_cases,
    repeated_directional_signals,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "protection_context_cases.json"


def load_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_context_evidence_is_sourced_and_contains_no_utility_weights() -> None:
    cases = load_cases()

    assert len(cases) >= 10
    assert len({case["case_id"] for case in cases}) == len(cases)
    for case in cases:
        assert case["source_reference"]
        assert case["normalization_basis"]
        lowered = str(case).lower()
        assert "poisson" not in lowered
        assert "probability" not in lowered
        assert "utility_weight" not in lowered
        assert "fair_total" not in case
        assert "fair_odds" not in case


def test_same_half_win_to_push_trade_is_context_dependent() -> None:
    report = analyze_protection_context_cases(load_cases())
    transition = next(
        item
        for item in report.transition_summaries
        if item.settlement_transition == "half_win_to_push"
    )

    assert transition.supporting_sample_count == 3
    assert transition.higher_count == 2
    assert transition.lower_count == 1
    assert transition.direction_status == "MIXED"
    assert transition.observed_price_gains == (0.21, 0.22, 0.25)
    assert report.same_transition_contradictions
    assert all(
        item.settlement_transition == "half_win_to_push"
        for item in report.same_transition_contradictions
    )
    assert any(
        item.smaller_gain_accepted == 0.21 and item.larger_gain_rejected == 0.25
        for item in report.same_transition_contradictions
    )


def test_low_carrier_dependence_and_independent_routes_point_higher_in_clean_sample() -> None:
    report = analyze_protection_context_cases(load_cases())
    signals = {(item.feature, item.value): item for item in repeated_directional_signals(report)}

    low_dependence = signals[("carrier_dependence", "low")]
    independent_routes = signals[("structural_family", "TWO_INDEPENDENT_ROUTES")]
    high_resistance = signals[("failure_mode_resistance", "high")]

    for signal in (low_dependence, independent_routes, high_resistance):
        assert signal.supporting_sample_count == 2
        assert signal.higher_count == 2
        assert signal.lower_count == 0
        assert signal.direction_status == "CONSISTENT_HIGHER"
        assert signal.production_ready is False


def test_weak_secondary_and_high_carrier_dependence_point_to_protection_in_clean_sample() -> None:
    report = analyze_protection_context_cases(load_cases())
    signals = {(item.feature, item.value): item for item in repeated_directional_signals(report)}

    weak_secondary = signals[("secondary_route_strength", "weak")]
    high_dependence = signals[("carrier_dependence", "high")]
    weak_two_sided = signals[("two_sided_strength", "weak")]

    for signal in (weak_secondary, high_dependence, weak_two_sided):
        assert signal.supporting_sample_count == 2
        assert signal.higher_count == 0
        assert signal.lower_count == 2
        assert signal.direction_status == "CONSISTENT_LOWER"
        assert signal.production_ready is False


def test_credible_secondary_route_alone_does_not_determine_the_trade() -> None:
    report = analyze_protection_context_cases(load_cases())
    credible = next(
        item
        for item in report.feature_summaries
        if item.feature == "secondary_route_strength" and item.value == "credible"
    )

    assert credible.supporting_sample_count == 3
    assert credible.higher_count == 2
    assert credible.lower_count == 1
    assert credible.direction_status == "MIXED"
    assert set(credible.transitions) == {"half_loss_to_full_loss", "half_win_to_push"}


def test_america_acceptance_control_is_preserved_without_training_the_signals() -> None:
    cases = load_cases()
    america = next(case for case in cases if case["case_id"] == "AME-MTY-20260903-CONTEXT")
    report = analyze_protection_context_cases(cases)

    assert america["selected_line"] == 2.75
    assert america["higher_line"] == 3.0
    assert america["higher_odds"] == 2.16
    assert america["evidence_status"] == "acceptance_control"
    assert report.acceptance_control_count == 1
    assert report.supporting_case_count == 5
    assert report.production_ready is False


def test_audited_upstream_misses_do_not_become_positive_policy_evidence() -> None:
    report = analyze_protection_context_cases(load_cases())

    assert report.negative_control_count == 2
    supporting_case_ids = {
        item.case_id
        for item in report.observations
        if item.evidence_status == "supporting_reconstruction"
    }
    assert "AVL-ARS-20260831-CONTEXT" not in supporting_case_ids
    assert "MTA-LUG-20260827-CONTEXT" not in supporting_case_ids
    assert report.blocker == "RESEARCH_ONLY_CONTEXT_DEPENDENT_PROTECTION_UTILITY_NOT_APPROVED"
