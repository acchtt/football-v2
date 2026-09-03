from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.football_engine.research.distribution_candidate_benchmark import (
    benchmark_distribution_candidates,
    proposal_eligible_candidates,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "projection_recovery_cases.json"
)


def main() -> None:
    recovery_cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    diagnostics = benchmark_distribution_candidates(recovery_cases)
    eligible = proposal_eligible_candidates(diagnostics)

    print(
        json.dumps(
            {
                "mode": "RESEARCH_ONLY",
                "production_ready": False,
                "blocker": "RESEARCH_ONLY_DISTRIBUTION_METHOD_NOT_APPROVED",
                "candidate_count": len(diagnostics),
                "proposal_eligible_candidate_ids": [
                    item.candidate_id for item in eligible
                ],
                "diagnostics": [asdict(item) for item in diagnostics],
            },
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
