from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from app.football_engine.research.distribution_shadow_benchmark import (
    ACCEPTANCE_HOLDOUT,
    AUDITED_ERROR,
    AUDIT_GOAL_BURDEN,
    BENCHMARK_BLOCKER,
    BENCHMARK_STATUS,
    CLEAN_SUPPORT,
    EXPLICIT_BAND,
    run_distribution_shadow_benchmark,
)
from app.football_engine.research.total_goal_scenario_recovery import (
    BAND_EQUAL_PRIMARY,
    LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
)


FIXTURE = Path(__file__).parent / "fixtures" / "distribution_shadow_benchmark_cases.json"
APP_ROOT = Path(__file__).parents[1] / "app"


def cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def summary(report: object, policy: str) -> object:
    return next(item for item in report.summaries if item.policy == policy)  # type: ignore[attr-defined]


def evaluation(report: object, policy: str, case_id: str) -> object:
    return next(
        item
        for item in report.evaluations  # type: ignore[attr-defined]
        if item.policy == policy and item.case_id == case_id
    )


def test_dataset_separates_clean_caution_errors_history_and_acceptance_holdout() -> None:
    data = cases()

    assert len(data) == 16
    assert len({str(case["case_id"]) for case in data}) == len(data)
    assert sum(case["evidence_tier"] == CLEAN_SUPPORT for case in data) == 5
    assert sum(case["evidence_tier"] == ACCEPTANCE_HOLDOUT for case in data) == 1
    assert sum(case["evidence_tier"] == AUDITED_ERROR for case in data) == 6
    assert sum(
        case["evidence_tier"] == AUDITED_ERROR
        and case["audit_class"] == AUDIT_GOAL_BURDEN
        for case in data
    ) == 1
    explicit = [case for case in data if case["band_basis"] == EXPLICIT_BAND]
    assert [case["case_id"] for case in explicit] == ["CAR-NOR-20260826-SHADOW"]


def test_shadow_run_pins_common_three_four_band_anchor_three_and_current_price_range() -> None:
    report = run_distribution_shadow_benchmark(cases())

    assert report.case_count == 16
    assert report.assumed_total_range == (3, 4)
    assert report.anchor_goal == 3
    assert report.minimum_price == Decimal("1.70")
    assert report.maximum_price == Decimal("2.30")
    assert report.comparison_status == BENCHMARK_STATUS
    assert report.production_ready is False
    assert report.blocker == BENCHMARK_BLOCKER


def test_both_candidates_match_four_of_five_clean_historical_ev_ranks() -> None:
    report = run_distribution_shadow_benchmark(cases())
    equal = summary(report, BAND_EQUAL_PRIMARY)
    anchor_upside = summary(report, LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE)

    assert equal.clean_support_count == 5
    assert anchor_upside.clean_support_count == 5
    assert equal.clean_exact_rank_match_count == 4
    assert anchor_upside.clean_exact_rank_match_count == 4
    assert equal.clean_positive_selected_ev_count == 5
    assert anchor_upside.clean_positive_selected_ev_count == 5


def test_equal_band_candidate_is_closer_to_clean_koln_expression_by_raw_ev_gap() -> None:
    report = run_distribution_shadow_benchmark(cases())
    equal = summary(report, BAND_EQUAL_PRIMARY)
    anchor_upside = summary(report, LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE)

    assert equal.clean_mean_ev_gap_to_top == Decimal("0.016")
    assert anchor_upside.clean_mean_ev_gap_to_top == (
        Decimal("0.1766666666666666666666666667") / Decimal("5")
    )

    equal_koln = evaluation(report, BAND_EQUAL_PRIMARY, "KOE-HOF-20260829-SHADOW")
    anchor_koln = evaluation(
        report,
        LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
        "KOE-HOF-20260829-SHADOW",
    )
    assert equal_koln.selected_line == Decimal("3.0")
    assert equal_koln.top_ev_line == Decimal("2.75")
    assert equal_koln.ev_gap_to_top == Decimal("0.080")
    assert anchor_koln.top_ev_line == Decimal("2.75")
    assert anchor_koln.ev_gap_to_top == Decimal("0.1766666666666666666666666667")


def test_anchor_upside_candidate_flags_the_single_clear_three_anchor_burden_error() -> None:
    report = run_distribution_shadow_benchmark(cases())
    equal = summary(report, BAND_EQUAL_PRIMARY)
    anchor_upside = summary(report, LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE)

    assert equal.audited_goal_burden_error_count == 1
    assert anchor_upside.audited_goal_burden_error_count == 1
    assert equal.audited_goal_burden_negative_ev_count == 0
    assert anchor_upside.audited_goal_burden_negative_ev_count == 1

    equal_jong = evaluation(report, BAND_EQUAL_PRIMARY, "JAZ-JUT-20260901-SHADOW")
    anchor_jong = evaluation(
        report,
        LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
        "JAZ-JUT-20260901-SHADOW",
    )
    assert equal_jong.selected_expected_pnl == Decimal("0.165")
    assert anchor_jong.selected_expected_pnl < Decimal("0")


def test_anchor_upside_candidate_also_turns_grasshopper_caution_negative() -> None:
    report = run_distribution_shadow_benchmark(cases())
    equal = summary(report, BAND_EQUAL_PRIMARY)
    anchor_upside = summary(report, LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE)

    assert equal.caution_count == 3
    assert anchor_upside.caution_count == 3
    assert equal.caution_negative_selected_ev_count == 0
    assert anchor_upside.caution_negative_selected_ev_count == 1

    gcz = evaluation(
        report,
        LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
        "GCZ-STG-20260903-SHADOW",
    )
    assert gcz.selected_line == Decimal("3.25")
    assert gcz.selected_settlement_at_anchor == "HALF_LOSS"
    assert gcz.selected_expected_pnl < Decimal("0")


def test_america_holdout_does_not_discriminate_between_candidates() -> None:
    report = run_distribution_shadow_benchmark(cases())
    equal = summary(report, BAND_EQUAL_PRIMARY)
    anchor_upside = summary(report, LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE)

    assert equal.acceptance_holdout_count == 1
    assert anchor_upside.acceptance_holdout_count == 1
    assert equal.acceptance_exact_rank_match_count == 1
    assert anchor_upside.acceptance_exact_rank_match_count == 1
    assert equal.acceptance_positive_selected_ev_count == 1
    assert anchor_upside.acceptance_positive_selected_ev_count == 1

    equal_america = evaluation(
        report,
        BAND_EQUAL_PRIMARY,
        "AME-MTY-20260903-HOLDOUT-SHADOW",
    )
    anchor_america = evaluation(
        report,
        LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
        "AME-MTY-20260903-HOLDOUT-SHADOW",
    )
    assert equal_america.top_ev_line == Decimal("2.75")
    assert anchor_america.top_ev_line == Decimal("2.75")
    assert equal_america.selected_odds == Decimal("1.89")
    assert anchor_america.selected_odds == Decimal("1.89")


def test_both_candidates_have_zero_mass_outside_the_recovered_band_and_cannot_be_full_projections() -> None:
    report = run_distribution_shadow_benchmark(cases())

    for item in report.summaries:
        assert item.probability_below_band == Decimal("0")
        assert item.probability_above_band == Decimal("0")
        assert item.production_ready is False
        assert item.blocker == BENCHMARK_BLOCKER


def test_mixed_band_runs_are_rejected_instead_of_pooled() -> None:
    data = cases()
    mutated = [dict(case) for case in data]
    mutated[1] = {**mutated[1], "assumed_total_range": [2, 4], "anchor_goal": 3}

    try:
        run_distribution_shadow_benchmark(mutated)
    except ValueError as exc:
        assert "one common assumed band and anchor" in str(exc)
    else:
        raise AssertionError("mixed-band benchmark should have been rejected")


def test_shadow_benchmark_is_not_imported_by_runtime_services() -> None:
    offenders: list[str] = []
    token = "football_engine.research.distribution_shadow_benchmark"

    for relative_root in ("api", "services", "schemas"):
        root = APP_ROOT / relative_root
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if token in path.read_text(encoding="utf-8"):
                offenders.append(path.relative_to(APP_ROOT).as_posix())

    assert offenders == []
