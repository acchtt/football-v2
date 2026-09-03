from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from statistics import mean
from typing import Any, Iterable, Mapping, Sequence

from .projection_reconstruction import (
    calibrate_candidate_against_market,
    distribution_from_weighted_scores,
    scenarios_from_recovered_scores,
)
from app.football_engine.versions.v0_2_47_R.market_math import projected_mean_goals


@dataclass(frozen=True, slots=True)
class ProjectionWeightCandidate:
    """Explicit research-only score-band weighting candidate.

    Primary weight is normally fixed to 1 because only relative weight matters after
    normalization. The caller must still supply both values; this module has no model
    defaults and does not infer weights from outcomes.
    """

    candidate_id: str
    primary_weight: Decimal
    upside_weight: Decimal


@dataclass(frozen=True, slots=True)
class CaseWeightDiagnostic:
    case_id: str
    projected_mean_goals: Decimal
    expected_total_min: Decimal
    expected_total_max: Decimal
    mean_inside_recovered_range: bool
    market_reference_kind: str | None
    reference_line: Decimal | None
    reference_odds: Decimal | None
    reference_ev_rank: int | None
    top_ev_line: Decimal | None
    top_ev_odds: Decimal | None


@dataclass(frozen=True, slots=True)
class WeightCandidateDiagnostic:
    candidate_id: str
    primary_weight: Decimal
    upside_weight: Decimal
    recovered_range_hits: int
    recovered_case_count: int
    market_reference_top_ev_hits: int
    market_reference_count: int
    mean_market_reference_rank: Decimal | None
    production_ready: bool
    blocker: str
    cases: tuple[CaseWeightDiagnostic, ...]


def evaluate_weight_candidates(
    recovery_cases: Iterable[Mapping[str, Any]],
    candidates: Iterable[ProjectionWeightCandidate],
    *,
    minimum_price: Decimal | float | str,
) -> tuple[WeightCandidateDiagnostic, ...]:
    """Evaluate explicit score-band weights against recovered projection evidence.

    This function deliberately does not select a winner. It returns transparent
    diagnostics so researchers can inspect compatibility across cases without turning
    a small historical sample into an automatically approved model parameter.
    """
    cases = tuple(recovery_cases)
    if not cases:
        raise ValueError("At least one recovery case is required")

    results: list[WeightCandidateDiagnostic] = []
    for candidate in candidates:
        _validate_candidate(candidate)
        case_diagnostics = tuple(
            _evaluate_case(case, candidate, minimum_price=minimum_price) for case in cases
        )
        market_ranks = [
            diagnostic.reference_ev_rank
            for diagnostic in case_diagnostics
            if diagnostic.reference_ev_rank is not None
        ]

        results.append(
            WeightCandidateDiagnostic(
                candidate_id=candidate.candidate_id,
                primary_weight=candidate.primary_weight,
                upside_weight=candidate.upside_weight,
                recovered_range_hits=sum(
                    diagnostic.mean_inside_recovered_range for diagnostic in case_diagnostics
                ),
                recovered_case_count=len(case_diagnostics),
                market_reference_top_ev_hits=sum(rank == 1 for rank in market_ranks),
                market_reference_count=len(market_ranks),
                mean_market_reference_rank=(
                    Decimal(str(mean(market_ranks))) if market_ranks else None
                ),
                production_ready=False,
                blocker="RESEARCH_ONLY_CANONICAL_PROJECTION_NOT_APPROVED",
                cases=case_diagnostics,
            )
        )

    return tuple(results)


def jointly_compatible_candidates(
    diagnostics: Iterable[WeightCandidateDiagnostic],
) -> tuple[WeightCandidateDiagnostic, ...]:
    """Return candidates that satisfy every currently observable recovery constraint.

    Compatibility is not approval. A candidate qualifies only when every recovered
    projected mean remains inside its historical goal range and every available market
    benchmark ranks first by exact EV. The function intentionally does not choose among
    multiple compatible candidates.
    """
    return tuple(
        diagnostic
        for diagnostic in diagnostics
        if diagnostic.recovered_range_hits == diagnostic.recovered_case_count
        and diagnostic.market_reference_top_ev_hits == diagnostic.market_reference_count
    )


def _evaluate_case(
    case: Mapping[str, Any],
    candidate: ProjectionWeightCandidate,
    *,
    minimum_price: Decimal | float | str,
) -> CaseWeightDiagnostic:
    case_id = str(case["case_id"])
    expected_range = case["expected_total_range"]
    if not isinstance(expected_range, Sequence) or len(expected_range) != 2:
        raise ValueError(f"{case_id}: expected_total_range must contain [min, max]")
    expected_min = Decimal(str(expected_range[0]))
    expected_max = Decimal(str(expected_range[1]))

    primary_scores = case["primary_scores"]
    upside_scores = case.get("upside_scores", ())
    scenarios = scenarios_from_recovered_scores(
        primary_scores,
        primary_weight=candidate.primary_weight,
        upside_scores=upside_scores,
        upside_weight=candidate.upside_weight if upside_scores else None,
    )
    distribution = distribution_from_weighted_scores(scenarios)
    projected_mean = projected_mean_goals(distribution)

    market_reference = case.get("market_reference")
    if not market_reference:
        return CaseWeightDiagnostic(
            case_id=case_id,
            projected_mean_goals=projected_mean,
            expected_total_min=expected_min,
            expected_total_max=expected_max,
            mean_inside_recovered_range=expected_min <= projected_mean <= expected_max,
            market_reference_kind=None,
            reference_line=None,
            reference_odds=None,
            reference_ev_rank=None,
            top_ev_line=None,
            top_ev_odds=None,
        )

    calibration = calibrate_candidate_against_market(
        scenarios,
        market_reference["offers"],
        selected_line=market_reference["reference_line"],
        selected_odds=market_reference["reference_odds"],
        minimum_price=minimum_price,
    )
    return CaseWeightDiagnostic(
        case_id=case_id,
        projected_mean_goals=projected_mean,
        expected_total_min=expected_min,
        expected_total_max=expected_max,
        mean_inside_recovered_range=expected_min <= projected_mean <= expected_max,
        market_reference_kind=str(market_reference["kind"]),
        reference_line=calibration.selected_line,
        reference_odds=calibration.selected_odds,
        reference_ev_rank=calibration.selected_ev_rank,
        top_ev_line=calibration.top_ev_line,
        top_ev_odds=calibration.top_ev_odds,
    )


def _validate_candidate(candidate: ProjectionWeightCandidate) -> None:
    if not candidate.candidate_id:
        raise ValueError("candidate_id cannot be empty")
    if candidate.primary_weight <= 0 or candidate.upside_weight <= 0:
        raise ValueError("Projection weights must be positive")
