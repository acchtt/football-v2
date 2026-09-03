from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from app.football_engine.research.total_goal_scenario_recovery import (
    BAND_EQUAL_PRIMARY,
    LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    RESEARCH_BLOCKER,
    analyze_total_goal_scenario_cases,
    build_band_anchor_candidate,
    collapse_explicit_scores_to_total_scenarios,
    evaluate_candidate_market_compatibility,
)
from app.football_engine.versions.v0_2_47_R.scenario_distribution import (
    build_scenario_distribution,
    build_total_goal_scenario_distribution,
)


FIXTURE = Path(__file__).parent / "fixtures" / "total_goal_scenario_cases.json"
APP_ROOT = Path(__file__).parents[1] / "app"


def cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_recovery_dataset_separates_current_historical_negative_and_acceptance_evidence() -> None:
    data = cases()
    report = analyze_total_goal_scenario_cases(data)

    assert len(data) >= 10
    assert len({str(case["case_id"]) for case in data}) == len(data)
    assert report.case_count == len(data)
    assert report.current_support_count == 4
    assert report.current_band_anchor_count == 1
    assert report.current_explicit_scenario_count == 0
    assert report.historical_explicit_scenario_count >= 3
    assert report.negative_control_count >= 2
    assert report.acceptance_control_count == 1
    assert report.current_band_anchor_sources == ("FB-20260826-CAR-NOR-PREMATCH",)
    assert report.mapping_status == "NON_IDENTIFIABLE_FROM_BAND_ANCHOR_ONLY"
    assert report.production_ready is False
    assert report.blocker == RESEARCH_BLOCKER


def test_equal_band_candidate_for_three_four_is_explicit_and_research_only() -> None:
    candidate = build_band_anchor_candidate(
        [3, 4],
        3,
        policy=BAND_EQUAL_PRIMARY,
    )

    assert candidate.primary_totals == (3, 4)
    assert candidate.upside_totals == ()
    assert candidate.distribution == {3: Decimal("0.5"), 4: Decimal("0.5")}
    assert candidate.projected_mean_goals == Decimal("3.5")
    assert candidate.even_money_fair_total == Decimal("3.5")
    assert candidate.production_ready is False
    assert candidate.blocker == RESEARCH_BLOCKER


def test_lower_anchor_primary_upper_band_upside_candidate_centers_more_mass_on_three() -> None:
    candidate = build_band_anchor_candidate(
        [3, 4],
        3,
        policy=LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    )

    two_thirds = Decimal("2") / Decimal("3")
    one_third = Decimal("1") / Decimal("3")
    assert candidate.primary_totals == (3,)
    assert candidate.upside_totals == (4,)
    assert candidate.distribution == {3: two_thirds, 4: one_third}
    assert candidate.projected_mean_goals == Decimal("10") / Decimal("3")
    assert candidate.even_money_fair_total == Decimal("3.25")
    assert candidate.production_ready is False


def test_band_and_anchor_do_not_choose_between_the_two_candidate_policies() -> None:
    equal = build_band_anchor_candidate([3, 4], 3, policy=BAND_EQUAL_PRIMARY)
    anchor = build_band_anchor_candidate(
        [3, 4],
        3,
        policy=LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    )

    assert equal.distribution != anchor.distribution
    assert equal.even_money_fair_total == Decimal("3.5")
    assert anchor.even_money_fair_total == Decimal("3.25")


def test_historical_score_scenarios_can_be_collapsed_without_losing_asian_total_information() -> None:
    primary_scores = [[2, 1], [3, 1], [2, 2]]
    upside_scores = [[3, 2]]
    primary_totals, upside_totals = collapse_explicit_scores_to_total_scenarios(
        primary_scores,
        upside_scores=upside_scores,
    )

    assert primary_totals == (3, 4, 4)
    assert upside_totals == (5,)

    score_distribution = build_scenario_distribution(
        primary_scores,
        upside_scores=upside_scores,
    ).distribution
    total_distribution = build_total_goal_scenario_distribution(
        primary_totals,
        upside_totals=upside_totals,
    ).distribution
    assert total_distribution == score_distribution


def test_cardiff_anchor_upside_candidate_is_compatible_with_america_acceptance_board_without_fitting_it() -> None:
    candidate = build_band_anchor_candidate(
        [3, 4],
        3,
        policy=LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    )
    board = [[2.5, 1.69], [2.75, 1.89], [3.0, 2.16], [3.25, 2.42]]
    compatibility = evaluate_candidate_market_compatibility(
        candidate,
        board,
        minimum_price=Decimal("1.70"),
    )

    assert compatibility.production_ready is False
    assert compatibility.blocker == RESEARCH_BLOCKER
    assert compatibility.eligible_offer_count == 3
    assert tuple(item.line for item in compatibility.ranked_evaluations) == (
        Decimal("2.75"),
        Decimal("3.0"),
        Decimal("3.25"),
    )
    assert compatibility.ranked_evaluations[0].offered_odds == Decimal("1.89")
    assert compatibility.ranked_evaluations[0].expected_pnl_units > compatibility.ranked_evaluations[1].expected_pnl_units


def test_acceptance_control_and_negative_controls_do_not_increase_current_mapping_support() -> None:
    data = cases()
    baseline = analyze_total_goal_scenario_cases(data)
    augmented = analyze_total_goal_scenario_cases(
        data
        + [
            {
                **next(case for case in data if case["evidence_status"] == "negative_control"),
                "case_id": "SYNTHETIC-NEGATIVE-COPY",
                "source_reference": "negative-copy",
            },
            {
                **next(case for case in data if case["evidence_status"] == "acceptance_control"),
                "case_id": "SYNTHETIC-ACCEPTANCE-COPY",
                "source_reference": "acceptance-copy",
            },
        ]
    )

    assert augmented.current_support_count == baseline.current_support_count
    assert augmented.current_band_anchor_count == baseline.current_band_anchor_count
    assert augmented.current_explicit_scenario_count == baseline.current_explicit_scenario_count
    assert augmented.mapping_status == baseline.mapping_status


def test_research_module_is_not_imported_by_runtime_services() -> None:
    offenders: list[str] = []
    token = "football_engine.research.total_goal_scenario_recovery"

    for relative_root in ("api", "services", "schemas"):
        root = APP_ROOT / relative_root
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if token in path.read_text(encoding="utf-8"):
                offenders.append(path.relative_to(APP_ROOT).as_posix())

    assert offenders == []
