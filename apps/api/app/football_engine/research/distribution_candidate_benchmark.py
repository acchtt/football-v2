from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence

from app.football_engine.research.projection_reconstruction import (
    WeightedScoreScenario,
    calibrate_candidate_against_market,
    distribution_from_weighted_scores,
)
from app.football_engine.versions.v0_2_47_R.market_math import projected_mean_goals


RESEARCH_BLOCKER = "RESEARCH_ONLY_DISTRIBUTION_METHOD_NOT_APPROVED"


@dataclass(frozen=True, slots=True)
class DistributionCandidate:
    candidate_id: str
    description: str
    preserves_recorded_upside: bool
    parameter_free: bool


@dataclass(frozen=True, slots=True)
class DistributionCaseDiagnostic:
    case_id: str
    projected_mean_goals: Decimal
    expected_range_low: Decimal
    expected_range_high: Decimal
    range_hit: bool
    market_reference_present: bool
    market_reference_top_ev_hit: bool | None
    reference_ev_rank: int | None


@dataclass(frozen=True, slots=True)
class DistributionCandidateDiagnostic:
    candidate_id: str
    preserves_recorded_upside: bool
    parameter_free: bool
    case_count: int
    range_hit_count: int
    market_reference_count: int
    market_reference_top_ev_hit_count: int
    all_ranges_hit: bool
    all_market_references_top_ev: bool
    proposal_eligible: bool
    case_diagnostics: tuple[DistributionCaseDiagnostic, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


CANDIDATES: tuple[DistributionCandidate, ...] = (
    DistributionCandidate(
        candidate_id="EQUAL_ALL_SCENARIOS",
        description="Every recorded primary and upside scoreline receives equal weight.",
        preserves_recorded_upside=True,
        parameter_free=True,
    ),
    DistributionCandidate(
        candidate_id="HALF_UPSIDE_WEIGHT",
        description="Primary scorelines receive weight 1 and upside scorelines weight 0.5.",
        preserves_recorded_upside=True,
        parameter_free=False,
    ),
    DistributionCandidate(
        candidate_id="RECIPROCAL_PRIMARY_COUNT_UPSIDE",
        description=(
            "Primary scorelines receive weight 1 and each upside scoreline receives "
            "1 / primary-score-count."
        ),
        preserves_recorded_upside=True,
        parameter_free=True,
    ),
    DistributionCandidate(
        candidate_id="RECIPROCAL_TOTAL_SCENARIO_COUNT_UPSIDE",
        description=(
            "Primary scorelines receive weight 1 and each upside scoreline receives "
            "1 / total-recorded-scenario-count."
        ),
        preserves_recorded_upside=True,
        parameter_free=True,
    ),
    DistributionCandidate(
        candidate_id="LIGHT_UPSIDE_010",
        description="Primary scorelines receive weight 1 and upside scorelines weight 0.10.",
        preserves_recorded_upside=True,
        parameter_free=False,
    ),
    DistributionCandidate(
        candidate_id="PRIMARY_ONLY_CONTROL",
        description="Only primary scorelines receive mass; recorded upside scorelines are discarded.",
        preserves_recorded_upside=False,
        parameter_free=True,
    ),
)


def benchmark_distribution_candidates(
    recovery_cases: Iterable[Mapping[str, Any]],
    *,
    candidates: Sequence[DistributionCandidate] = CANDIDATES,
    minimum_price: Decimal | float | str = Decimal("1.70"),
) -> tuple[DistributionCandidateDiagnostic, ...]:
    """Benchmark non-Poisson scenario-weighting methods against recovered evidence.

    A proposal-eligible candidate must preserve recorded upside evidence, introduce no
    tunable numeric hyperparameter, keep every recovered projected mean inside its
    historical expected-total range, and rank every recovered market reference first by
    exact Asian expected P/L. Proposal eligibility is research-only and is not production
    approval.
    """
    case_list = tuple(recovery_cases)
    if not case_list:
        raise ValueError("At least one recovery case is required")

    diagnostics: list[DistributionCandidateDiagnostic] = []
    for candidate in candidates:
        case_diagnostics = tuple(
            _evaluate_case(case, candidate, minimum_price=minimum_price)
            for case in case_list
        )
        reference_cases = tuple(
            item for item in case_diagnostics if item.market_reference_present
        )
        range_hits = sum(item.range_hit for item in case_diagnostics)
        market_hits = sum(
            item.market_reference_top_ev_hit is True for item in reference_cases
        )
        all_ranges = range_hits == len(case_diagnostics)
        all_market = market_hits == len(reference_cases)
        eligible = (
            candidate.preserves_recorded_upside
            and candidate.parameter_free
            and all_ranges
            and all_market
        )
        diagnostics.append(
            DistributionCandidateDiagnostic(
                candidate_id=candidate.candidate_id,
                preserves_recorded_upside=candidate.preserves_recorded_upside,
                parameter_free=candidate.parameter_free,
                case_count=len(case_diagnostics),
                range_hit_count=range_hits,
                market_reference_count=len(reference_cases),
                market_reference_top_ev_hit_count=market_hits,
                all_ranges_hit=all_ranges,
                all_market_references_top_ev=all_market,
                proposal_eligible=eligible,
                case_diagnostics=case_diagnostics,
            )
        )

    return tuple(diagnostics)


def proposal_eligible_candidates(
    diagnostics: Iterable[DistributionCandidateDiagnostic],
) -> tuple[DistributionCandidateDiagnostic, ...]:
    return tuple(item for item in diagnostics if item.proposal_eligible)


def build_candidate_distribution(
    recovery_case: Mapping[str, Any],
    candidate: DistributionCandidate,
) -> dict[int, Decimal]:
    """Build one candidate distribution without Poisson smoothing or invented tails."""
    primary_scores = tuple(recovery_case.get("primary_scores", ()))
    upside_scores = tuple(recovery_case.get("upside_scores", ()))
    if not primary_scores:
        raise ValueError("Candidate benchmark requires at least one recovered primary scoreline")

    primary_weight = Decimal("1")
    upside_weight = _upside_weight(candidate, len(primary_scores), len(upside_scores))
    scenarios: list[WeightedScoreScenario] = []

    for score in primary_scores:
        home, away = _parse_score(score)
        scenarios.append(WeightedScoreScenario(home, away, primary_weight, "primary"))

    if candidate.preserves_recorded_upside:
        for score in upside_scores:
            home, away = _parse_score(score)
            scenarios.append(WeightedScoreScenario(home, away, upside_weight, "upside"))

    return distribution_from_weighted_scores(scenarios)


def _evaluate_case(
    case: Mapping[str, Any],
    candidate: DistributionCandidate,
    *,
    minimum_price: Decimal | float | str,
) -> DistributionCaseDiagnostic:
    distribution = build_candidate_distribution(case, candidate)
    mean = projected_mean_goals(distribution)
    low, high = _parse_range(case.get("expected_total_range"))
    range_hit = low <= mean <= high
    market_reference = case.get("market_reference")

    if not isinstance(market_reference, Mapping):
        return DistributionCaseDiagnostic(
            case_id=str(case["case_id"]),
            projected_mean_goals=mean,
            expected_range_low=low,
            expected_range_high=high,
            range_hit=range_hit,
            market_reference_present=False,
            market_reference_top_ev_hit=None,
            reference_ev_rank=None,
        )

    calibration = calibrate_candidate_against_market(
        _weighted_scenarios_for_distribution(case, candidate),
        market_reference["offers"],
        selected_line=market_reference["reference_line"],
        selected_odds=market_reference["reference_odds"],
        minimum_price=minimum_price,
    )
    return DistributionCaseDiagnostic(
        case_id=str(case["case_id"]),
        projected_mean_goals=mean,
        expected_range_low=low,
        expected_range_high=high,
        range_hit=range_hit,
        market_reference_present=True,
        market_reference_top_ev_hit=calibration.selected_ev_rank == 1,
        reference_ev_rank=calibration.selected_ev_rank,
    )


def _weighted_scenarios_for_distribution(
    recovery_case: Mapping[str, Any],
    candidate: DistributionCandidate,
) -> tuple[WeightedScoreScenario, ...]:
    primary_scores = tuple(recovery_case.get("primary_scores", ()))
    upside_scores = tuple(recovery_case.get("upside_scores", ()))
    if not primary_scores:
        raise ValueError("Candidate benchmark requires primary scorelines")

    upside_weight = _upside_weight(candidate, len(primary_scores), len(upside_scores))
    scenarios: list[WeightedScoreScenario] = []
    for score in primary_scores:
        home, away = _parse_score(score)
        scenarios.append(WeightedScoreScenario(home, away, Decimal("1"), "primary"))
    if candidate.preserves_recorded_upside:
        for score in upside_scores:
            home, away = _parse_score(score)
            scenarios.append(WeightedScoreScenario(home, away, upside_weight, "upside"))
    return tuple(scenarios)


def _upside_weight(
    candidate: DistributionCandidate,
    primary_count: int,
    upside_count: int,
) -> Decimal:
    if primary_count <= 0:
        raise ValueError("primary_count must be positive")
    if upside_count == 0:
        return Decimal("1")

    candidate_id = candidate.candidate_id
    if candidate_id == "EQUAL_ALL_SCENARIOS":
        return Decimal("1")
    if candidate_id == "HALF_UPSIDE_WEIGHT":
        return Decimal("0.5")
    if candidate_id == "RECIPROCAL_PRIMARY_COUNT_UPSIDE":
        return Decimal("1") / Decimal(primary_count)
    if candidate_id == "RECIPROCAL_TOTAL_SCENARIO_COUNT_UPSIDE":
        return Decimal("1") / Decimal(primary_count + upside_count)
    if candidate_id == "LIGHT_UPSIDE_010":
        return Decimal("0.10")
    if candidate_id == "PRIMARY_ONLY_CONTROL":
        return Decimal("1")
    raise ValueError(f"Unknown distribution candidate {candidate_id!r}")


def _parse_score(score: Sequence[int]) -> tuple[int, int]:
    if len(score) != 2:
        raise ValueError("Recovered scoreline must contain [home_goals, away_goals]")
    home, away = int(score[0]), int(score[1])
    if home < 0 or away < 0:
        raise ValueError("Recovered scoreline goals cannot be negative")
    return home, away


def _parse_range(value: Any) -> tuple[Decimal, Decimal]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or len(value) != 2:
        raise ValueError("expected_total_range must contain [low, high]")
    low, high = Decimal(str(value[0])), Decimal(str(value[1]))
    if low < 0 or high < low:
        raise ValueError("Invalid expected_total_range")
    return low, high
