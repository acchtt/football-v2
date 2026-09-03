from __future__ import annotations

import json
from pathlib import Path

from app.football_engine.research.distribution_shadow_benchmark import (
    run_distribution_shadow_benchmark,
)
from app.football_engine.research.total_goal_scenario_recovery import (
    BAND_EQUAL_PRIMARY,
    LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
)


FIXTURE = (
    Path(__file__).parents[1]
    / "tests"
    / "fixtures"
    / "distribution_shadow_benchmark_cases.json"
)


def main() -> None:
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))
    report = run_distribution_shadow_benchmark(cases)

    payload = {
        "mode": "RESEARCH_ONLY_SHADOW_BENCHMARK",
        "production_ready": report.production_ready,
        "blocker": report.blocker,
        "comparison_status": report.comparison_status,
        "assumption": {
            "anchor_goal": report.anchor_goal,
            "assumed_total_range": report.assumed_total_range,
            "minimum_price": str(report.minimum_price),
            "maximum_price": str(report.maximum_price),
            "case_count": report.case_count,
            "explicit_band_anchor_case_count": 1,
            "note": (
                "Only Cardiff-Norwich preserves the 3-4 band and central-three anchor "
                "explicitly. Other rows apply 3-4 as a shadow assumption to test market "
                "compatibility, not to claim recovered historical band evidence."
            ),
        },
        "candidate_summaries": [
            {
                "policy": item.policy,
                "fair_total": str(item.fair_total),
                "projected_mean_goals": str(item.projected_mean_goals),
                "clean_support_count": item.clean_support_count,
                "clean_exact_rank_match_count": item.clean_exact_rank_match_count,
                "clean_positive_selected_ev_count": item.clean_positive_selected_ev_count,
                "clean_mean_ev_gap_to_top": str(item.clean_mean_ev_gap_to_top),
                "caution_count": item.caution_count,
                "caution_negative_selected_ev_count": item.caution_negative_selected_ev_count,
                "audited_goal_burden_error_count": item.audited_goal_burden_error_count,
                "audited_goal_burden_negative_ev_count": item.audited_goal_burden_negative_ev_count,
                "acceptance_holdout_count": item.acceptance_holdout_count,
                "acceptance_exact_rank_match_count": item.acceptance_exact_rank_match_count,
                "acceptance_positive_selected_ev_count": item.acceptance_positive_selected_ev_count,
                "probability_below_band": str(item.probability_below_band),
                "probability_above_band": str(item.probability_above_band),
            }
            for item in report.summaries
        ],
        "diagnostic_cases": [
            _evaluation_payload(report, BAND_EQUAL_PRIMARY, "KOE-HOF-20260829-SHADOW"),
            _evaluation_payload(
                report,
                LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
                "KOE-HOF-20260829-SHADOW",
            ),
            _evaluation_payload(report, BAND_EQUAL_PRIMARY, "JAZ-JUT-20260901-SHADOW"),
            _evaluation_payload(
                report,
                LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
                "JAZ-JUT-20260901-SHADOW",
            ),
            _evaluation_payload(
                report,
                BAND_EQUAL_PRIMARY,
                "AME-MTY-20260903-HOLDOUT-SHADOW",
            ),
            _evaluation_payload(
                report,
                LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
                "AME-MTY-20260903-HOLDOUT-SHADOW",
            ),
        ],
        "interpretation": [
            "Both candidates reproduce 4 of 5 clean historical selected lines by raw EV rank.",
            "Both candidates reproduce the America-Monterrey holdout, so the acceptance case does not identify the mapping.",
            "Equal-band has the smaller clean EV-gap penalty, driven mainly by Koln-Hoffenheim.",
            "Anchor-plus-upside is more conservative above the three-goal anchor and flags the audited Jong AZ O3.25 burden as negative EV.",
            "Both candidates put zero probability outside the 3-4 band, proving that a recovered expected band is still not a complete production goal distribution.",
            "No candidate is approved or activated by this report.",
        ],
    }
    print(json.dumps(payload, indent=2))


def _evaluation_payload(report: object, policy: str, case_id: str) -> dict[str, object]:
    item = next(
        evaluation
        for evaluation in report.evaluations  # type: ignore[attr-defined]
        if evaluation.policy == policy and evaluation.case_id == case_id
    )
    return {
        "case_id": item.case_id,
        "match": item.match,
        "policy": item.policy,
        "selected_line": str(item.selected_line),
        "selected_odds": str(item.selected_odds),
        "selected_settlement_at_anchor": item.selected_settlement_at_anchor,
        "selected_expected_pnl": str(item.selected_expected_pnl),
        "selected_ev_rank": item.selected_ev_rank,
        "top_ev_line": str(item.top_ev_line),
        "top_ev_odds": str(item.top_ev_odds),
        "top_ev_expected_pnl": str(item.top_ev_expected_pnl),
        "ev_gap_to_top": str(item.ev_gap_to_top),
        "exact_rank_match": item.exact_rank_match,
    }


if __name__ == "__main__":
    main()
