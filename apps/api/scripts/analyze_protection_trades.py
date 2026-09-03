from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.football_engine.research.protection_trade_recovery import (
    analyze_protection_trade_cases,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "protection_trade_cases.json"
)


def main() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    report = analyze_protection_trade_cases(cases)
    diagnostic = report.supporting_threshold_diagnostic

    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": False,
        "blocker": report.blocker,
        "case_count": report.case_count,
        "supporting_case_count": report.supporting_case_count,
        "acceptance_control_count": report.acceptance_control_count,
        "negative_control_count": report.negative_control_count,
        "floor_elimination_count": report.floor_elimination_count,
        "fixed_price_threshold": asdict(diagnostic),
        "observations": [asdict(observation) for observation in report.observations],
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
