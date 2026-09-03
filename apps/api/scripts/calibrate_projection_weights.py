from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = API_ROOT / "tests" / "fixtures" / "projection_recovery_cases.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Research-only sweep of explicit upside/primary score-band weight ratios. "
            "This command cannot activate a production projection or verdict."
        )
    )
    parser.add_argument(
        "--upside-ratios",
        required=True,
        help="Comma-separated positive ratios, for example: 0.05,0.10,0.25,0.50,1.0",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE,
        help="Recovered projection evidence JSON fixture.",
    )
    return parser.parse_args()


def main() -> None:
    if str(API_ROOT) not in sys.path:
        sys.path.insert(0, str(API_ROOT))

    from app.football_engine.research.calibration_search import (
        ProjectionWeightCandidate,
        evaluate_weight_candidates,
        jointly_compatible_candidates,
    )
    from app.model_state import get_model_state

    args = parse_args()
    recovery_cases = json.loads(args.fixture.read_text(encoding="utf-8"))
    ratios = _parse_ratios(args.upside_ratios)
    candidates = tuple(
        ProjectionWeightCandidate(
            candidate_id=f"primary-1_upside-{ratio}",
            primary_weight=Decimal("1"),
            upside_weight=ratio,
        )
        for ratio in ratios
    )

    diagnostics = evaluate_weight_candidates(
        recovery_cases,
        candidates,
        minimum_price=get_model_state().market.minimum_price,
    )
    compatible = jointly_compatible_candidates(diagnostics)

    payload = {
        "mode": "RESEARCH_ONLY",
        "production_ready": False,
        "blocker": "RESEARCH_ONLY_CANONICAL_PROJECTION_NOT_APPROVED",
        "candidate_count": len(diagnostics),
        "jointly_compatible_candidate_ids": [item.candidate_id for item in compatible],
        "diagnostics": [asdict(item) for item in diagnostics],
    }
    print(json.dumps(payload, indent=2, default=str))


def _parse_ratios(raw: str) -> tuple[Decimal, ...]:
    ratios = tuple(Decimal(item.strip()) for item in raw.split(",") if item.strip())
    if not ratios:
        raise ValueError("At least one upside ratio is required")
    if any(ratio <= 0 for ratio in ratios):
        raise ValueError("Upside ratios must be positive")
    return ratios


if __name__ == "__main__":
    main()
