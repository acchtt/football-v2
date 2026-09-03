import json
from decimal import Decimal
from pathlib import Path

from app.football_engine.research.calibration_search import (
    ProjectionWeightCandidate,
    evaluate_weight_candidates,
    jointly_compatible_candidates,
)
from app.model_state import get_model_state


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "projection_recovery_cases.json"


def load_recovery_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def candidate(ratio: str) -> ProjectionWeightCandidate:
    return ProjectionWeightCandidate(
        candidate_id=f"ratio-{ratio}",
        primary_weight=Decimal("1"),
        upside_weight=Decimal(ratio),
    )


def test_calibration_search_keeps_compatibility_separate_from_approval() -> None:
    diagnostics = evaluate_weight_candidates(
        load_recovery_cases(),
        (candidate("0.10"), candidate("0.25"), candidate("0.50"), candidate("3.00")),
        minimum_price=get_model_state().market.minimum_price,
    )
    by_id = {item.candidate_id: item for item in diagnostics}

    assert by_id["ratio-0.10"].recovered_range_hits == 5
    assert by_id["ratio-0.10"].market_reference_top_ev_hits == 4
    assert by_id["ratio-0.10"].market_reference_count == 4

    assert by_id["ratio-0.25"].recovered_range_hits == 5
    assert by_id["ratio-0.25"].market_reference_top_ev_hits == 4

    assert by_id["ratio-0.50"].market_reference_top_ev_hits == 3
    assert by_id["ratio-3.00"].recovered_range_hits < 5

    assert all(item.production_ready is False for item in diagnostics)
    assert all(
        item.blocker == "RESEARCH_ONLY_CANONICAL_PROJECTION_NOT_APPROVED"
        for item in diagnostics
    )


def test_joint_compatibility_does_not_choose_a_single_weight() -> None:
    diagnostics = evaluate_weight_candidates(
        load_recovery_cases(),
        (candidate("0.10"), candidate("0.25"), candidate("0.50")),
        minimum_price=Decimal("1.70"),
    )

    compatible = jointly_compatible_candidates(diagnostics)

    assert [item.candidate_id for item in compatible] == ["ratio-0.10", "ratio-0.25"]
    assert all(item.production_ready is False for item in compatible)


def test_recovered_market_references_are_benchmarks_not_retroactive_locks() -> None:
    cases = load_recovery_cases()
    references = [case["market_reference"] for case in cases if "market_reference" in case]

    assert len(references) == 4
    assert all(reference["kind"] == "historical_benchmark_hold" for reference in references)
