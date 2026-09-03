from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Mapping, Sequence

from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer
from app.football_engine.versions.v0_2_47_R.market_math import (
    MarketOfferEvaluation,
    even_money_fair_total,
    normalize_goal_distribution,
    projected_mean_goals,
    rank_over_offers,
)


@dataclass(frozen=True, slots=True)
class WeightedScoreScenario:
    """One research scenario used to reconstruct a total-goal distribution.

    The weight is supplied by the researcher. This module does not infer or approve
    scenario weights from grades, xG, teams, or historical outcomes.
    """

    home_goals: int
    away_goals: int
    weight: Decimal
    label: str = "primary"

    @property
    def total_goals(self) -> int:
        return self.home_goals + self.away_goals


@dataclass(frozen=True, slots=True)
class ProjectionCalibrationResult:
    """Diagnostics for one candidate projection against one historical market board."""

    projected_mean_goals: Decimal
    even_money_fair_total: Decimal
    selected_line: Decimal
    selected_odds: Decimal
    selected_expected_pnl: Decimal
    selected_ev_rank: int
    top_ev_line: Decimal
    top_ev_odds: Decimal
    top_ev_expected_pnl: Decimal
    eligible_offer_count: int


def distribution_from_weighted_scores(
    scenarios: Iterable[WeightedScoreScenario],
) -> dict[int, Decimal]:
    """Aggregate explicit score-scenario weights into a normalized totals distribution.

    This is deliberately a mechanical adapter. It does not invent a Poisson model,
    smooth tails, or assign weights to unobserved scorelines.
    """
    totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    found = False

    for scenario in scenarios:
        found = True
        if scenario.home_goals < 0 or scenario.away_goals < 0:
            raise ValueError("Score-scenario goals cannot be negative")
        if scenario.weight <= 0:
            raise ValueError("Score-scenario weights must be positive")
        totals[scenario.total_goals] += scenario.weight

    if not found:
        raise ValueError("At least one score scenario is required")

    return normalize_goal_distribution(totals)


def scenarios_from_recovered_scores(
    primary_scores: Sequence[Sequence[int]],
    *,
    primary_weight: Decimal | float | str,
    upside_scores: Sequence[Sequence[int]] = (),
    upside_weight: Decimal | float | str | None = None,
) -> tuple[WeightedScoreScenario, ...]:
    """Build an explicit research candidate from recovered score-band evidence.

    The caller must provide every weight. There are intentionally no defaults because
    the historical ledger did not recover a canonical weighting rule.
    """
    primary = Decimal(str(primary_weight))
    if primary <= 0:
        raise ValueError("primary_weight must be positive")

    upside: Decimal | None = None
    if upside_scores:
        if upside_weight is None:
            raise ValueError("upside_weight is required when upside scores are supplied")
        upside = Decimal(str(upside_weight))
        if upside <= 0:
            raise ValueError("upside_weight must be positive")

    scenarios: list[WeightedScoreScenario] = []
    for score in primary_scores:
        home, away = _parse_score_pair(score)
        scenarios.append(
            WeightedScoreScenario(
                home_goals=home,
                away_goals=away,
                weight=primary,
                label="primary",
            )
        )

    for score in upside_scores:
        home, away = _parse_score_pair(score)
        scenarios.append(
            WeightedScoreScenario(
                home_goals=home,
                away_goals=away,
                weight=upside,
                label="upside",
            )
        )

    return tuple(scenarios)


def calibrate_candidate_against_market(
    scenarios: Iterable[WeightedScoreScenario],
    offers: Iterable[Sequence[Decimal | float | str]],
    *,
    selected_line: Decimal | float | str,
    selected_odds: Decimal | float | str,
    minimum_price: Decimal | float | str,
) -> ProjectionCalibrationResult:
    """Compare one explicit projection candidate with one historical selected offer.

    The output is diagnostic only. A selected line ranking first by expected P/L is not
    sufficient for an official verdict because the recovered production policy also
    considered protection, failure modes, structure, and situational risk.
    """
    distribution = distribution_from_weighted_scores(scenarios)
    minimum = Decimal(str(minimum_price))
    selected_line_decimal = Decimal(str(selected_line))
    selected_odds_decimal = Decimal(str(selected_odds))

    eligible_offers = tuple(
        OddsOffer(line=Decimal(str(line)), over_odds=Decimal(str(odds)))
        for line, odds in offers
        if Decimal(str(odds)) >= minimum
    )
    if not eligible_offers:
        raise ValueError("No offers satisfy the minimum price floor")

    ranked = rank_over_offers(distribution, eligible_offers)
    selected = _find_selected_offer(
        ranked,
        selected_line_decimal,
        selected_odds_decimal,
    )
    selected_rank = next(
        index for index, evaluation in enumerate(ranked, start=1) if evaluation == selected
    )
    fair_total = even_money_fair_total(distribution)
    top = ranked[0]

    return ProjectionCalibrationResult(
        projected_mean_goals=projected_mean_goals(distribution),
        even_money_fair_total=fair_total.line,
        selected_line=selected.line,
        selected_odds=selected.offered_odds,
        selected_expected_pnl=selected.expected_pnl_units,
        selected_ev_rank=selected_rank,
        top_ev_line=top.line,
        top_ev_odds=top.offered_odds,
        top_ev_expected_pnl=top.expected_pnl_units,
        eligible_offer_count=len(ranked),
    )


def _find_selected_offer(
    evaluations: Sequence[MarketOfferEvaluation],
    selected_line: Decimal,
    selected_odds: Decimal,
) -> MarketOfferEvaluation:
    for evaluation in evaluations:
        if evaluation.line == selected_line and evaluation.offered_odds == selected_odds:
            return evaluation
    raise ValueError("Historical selected offer is not present in the eligible market board")


def _parse_score_pair(score: Sequence[int]) -> tuple[int, int]:
    if len(score) != 2:
        raise ValueError("Score scenarios must contain exactly [home_goals, away_goals]")
    home, away = int(score[0]), int(score[1])
    if home < 0 or away < 0:
        raise ValueError("Score-scenario goals cannot be negative")
    return home, away
