from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.football_engine.research.central_outcome_recovery import (
    analyze_central_outcome_cases,
    sufficiently_supported_anchor_groups,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "central_outcome_cases.json"
)


def main() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    report = analyze_central_outcome_cases(cases)
    proposal_candidates = sufficiently_supported_anchor_groups(report)

    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": False,
        "blocker": report.blocker,
        "case_count": report.case_count,
        "supporting_case_count": report.supporting_case_count,
        "acceptance_control_count": report.acceptance_control_count,
        "negative_control_count": report.negative_control_count,
        "non_lowest_selection_count": report.non_lowest_selection_count,
        "sufficiently_supported_anchor_groups": [
            {
                "structural_family": group.structural_family,
                "anchor_goals": list(group.supporting_anchor_goals),
                "selected_line_offsets": list(group.supporting_selected_line_offsets),
            }
            for group in proposal_candidates
        ],
        "groups": [asdict(group) for group in report.groups],
        "guardrail": (
            "A recovered integer anchor is not a fair total and must not select a market line. "
            "Situational adjustment, goal distribution, fair-total construction, and market "
            "comparison remain pending canonical logic."
        ),
    }
    print(json.dumps(payload, indent=2, default=str))


if __name__ == "__main__":
    main()
