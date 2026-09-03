from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.football_engine.research.protection_context_recovery import (
    analyze_protection_context_cases,
    repeated_directional_signals,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "protection_context_cases.json"
)


def main() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    report = analyze_protection_context_cases(cases)
    signals = repeated_directional_signals(report)

    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": False,
        "blocker": report.blocker,
        "case_count": report.case_count,
        "supporting_case_count": report.supporting_case_count,
        "historical_case_count": report.historical_case_count,
        "acceptance_control_count": report.acceptance_control_count,
        "negative_control_count": report.negative_control_count,
        "transition_summaries": [asdict(item) for item in report.transition_summaries],
        "same_transition_contradictions": [
            asdict(item) for item in report.same_transition_contradictions
        ],
        "repeated_directional_signals": [asdict(item) for item in signals],
    }
    print(json.dumps(payload, indent=2, default=str))


if __name__ == "__main__":
    main()
