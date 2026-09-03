from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.football_engine.research.scenario_producer_recovery import (
    analyze_scenario_producer_evidence,
    resolve_scenario_template,
)


FIXTURE = Path(__file__).parents[1] / "tests" / "fixtures" / "scenario_producer_evidence.json"


def main() -> None:
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))
    report = analyze_scenario_producer_evidence(cases)
    resolutions = [
        asdict(
            resolve_scenario_template(
                report,
                structural_archetype=summary.structural_archetype,
            )
        )
        for summary in report.summaries
    ]
    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": report.production_ready,
        "blocker": report.blocker,
        "case_count": report.case_count,
        "production_ready_template_count": sum(
            summary.template_candidate_ready for summary in report.summaries
        ),
        "summaries": [asdict(summary) for summary in report.summaries],
        "resolutions": resolutions,
        "guardrail": (
            "Historical/cross-version score templates and audited misses cannot become "
            "current v0.2.47-R scenario rules. Missing explicit scenarios remain unresolved."
        ),
    }
    print(json.dumps(payload, indent=2, default=list))


if __name__ == "__main__":
    main()
