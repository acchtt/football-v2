from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.football_engine.research.template_recovery import (
    analyze_template_cases,
    sufficiently_supported_consistent_groups,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "projection_template_cases.json"
)


def main() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    report = analyze_template_cases(cases)
    repeated_support = sufficiently_supported_consistent_groups(report)

    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": False,
        "blocker": report.blocker,
        "case_count": report.case_count,
        "supporting_case_count": report.supporting_case_count,
        "negative_control_count": report.negative_control_count,
        "sufficiently_supported_consistent_archetypes": [
            group.structural_archetype for group in repeated_support
        ],
        "groups": [asdict(group) for group in report.groups],
    }
    print(json.dumps(payload, indent=2, default=str))


if __name__ == "__main__":
    main()
