from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from app.football_engine.research.total_goal_scenario_recovery import (
    BAND_EQUAL_PRIMARY,
    LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    analyze_total_goal_scenario_cases,
    build_band_anchor_candidate,
    evaluate_candidate_market_compatibility,
)


FIXTURE = Path(__file__).parents[1] / "tests" / "fixtures" / "total_goal_scenario_cases.json"


def _decimal_dict(values: dict[int, Decimal]) -> dict[str, str]:
    return {str(goal): str(probability) for goal, probability in sorted(values.items())}


def main() -> None:
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))
    report = analyze_total_goal_scenario_cases(cases)
    equal = build_band_anchor_candidate([3, 4], 3, policy=BAND_EQUAL_PRIMARY)
    anchor_upside = build_band_anchor_candidate(
        [3, 4],
        3,
        policy=LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    )
    america_board = [[2.5, 1.69], [2.75, 1.89], [3.0, 2.16], [3.25, 2.42]]
    compatibility = evaluate_candidate_market_compatibility(
        anchor_upside,
        america_board,
        minimum_price="1.70",
    )

    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": report.production_ready,
        "blocker": report.blocker,
        "evidence": {
            "case_count": report.case_count,
            "current_support_count": report.current_support_count,
            "current_band_anchor_count": report.current_band_anchor_count,
            "current_explicit_scenario_count": report.current_explicit_scenario_count,
            "historical_explicit_scenario_count": report.historical_explicit_scenario_count,
            "negative_control_count": report.negative_control_count,
            "acceptance_control_count": report.acceptance_control_count,
            "current_band_anchor_sources": report.current_band_anchor_sources,
            "mapping_status": report.mapping_status,
        },
        "three_four_candidate_comparison": [
            {
                "policy": equal.policy,
                "primary_totals": equal.primary_totals,
                "upside_totals": equal.upside_totals,
                "distribution": _decimal_dict(equal.distribution),
                "projected_mean_goals": str(equal.projected_mean_goals),
                "even_money_fair_total": str(equal.even_money_fair_total),
            },
            {
                "policy": anchor_upside.policy,
                "primary_totals": anchor_upside.primary_totals,
                "upside_totals": anchor_upside.upside_totals,
                "distribution": _decimal_dict(anchor_upside.distribution),
                "projected_mean_goals": str(anchor_upside.projected_mean_goals),
                "even_money_fair_total": str(anchor_upside.even_money_fair_total),
            },
        ],
        "america_acceptance_compatibility_only": {
            "fitted_to_acceptance": False,
            "minimum_price": str(compatibility.minimum_price),
            "ranked_eligible_offers": [
                {
                    "line": str(item.line),
                    "odds": str(item.offered_odds),
                    "expected_pnl_units": str(item.expected_pnl_units),
                }
                for item in compatibility.ranked_evaluations
            ],
            "note": (
                "The acceptance board is a compatibility control only. Ranking first by "
                "diagnostic expected P/L is not sufficient for an official lock."
            ),
        },
        "guardrails": [
            "No team scoreline is invented.",
            "A numeric band plus central anchor does not identify scenario multiplicity.",
            "Cardiff-Norwich is currently the only clean active case with both band and anchor.",
            "Historical/cross-version explicit scenarios and negative controls cannot activate a policy.",
            "Method C remains active only as the downstream distribution adapter.",
            "MODEL_STATE and /verdict remain unchanged by this research report.",
        ],
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
