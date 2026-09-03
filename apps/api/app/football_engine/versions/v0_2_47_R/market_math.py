from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping

from .goal_burden import OddsOffer
from .settlement import AsianTotalSettlement, settle_over_with_pnl


@dataclass(frozen=True, slots=True)
class MarketOfferEvaluation:
    line: Decimal
    offered_odds: Decimal
    fair_odds: Decimal | None
    expected_pnl_units: Decimal
    full_win_probability: Decimal
    half_win_probability: Decimal
    push_probability: Decimal
    half_loss_probability: Decimal
    full_loss_probability: Decimal


@dataclass(frozen=True, slots=True)
class FairTotalEvaluation:
    line: Decimal
    even_money_expected_pnl: Decimal
    projected_mean_goals: Decimal


def normalize_goal_distribution(
    probabilities: Mapping[int, Decimal | float | str],
) -> dict[int, Decimal]:
    """Validate and normalize an integer 90-minute total-goal distribution.

    This module intentionally does not create the distribution. It only consumes a
    projection supplied by an approved upstream model and performs exact Asian-total
    market math.
    """
    if not probabilities:
        raise ValueError("Goal distribution cannot be empty")

    normalized_input: dict[int, Decimal] = {}
    for total_goals, raw_probability in probabilities.items():
        if total_goals < 0:
            raise ValueError("Goal totals cannot be negative")
        probability = Decimal(str(raw_probability))
        if probability < 0:
            raise ValueError("Goal probabilities cannot be negative")
        normalized_input[int(total_goals)] = probability

    total_probability = sum(normalized_input.values(), Decimal("0"))
    if total_probability <= 0:
        raise ValueError("Goal distribution must contain positive probability mass")

    return {
        total_goals: probability / total_probability
        for total_goals, probability in sorted(normalized_input.items())
        if probability > 0
    }


def projected_mean_goals(
    probabilities: Mapping[int, Decimal | float | str],
) -> Decimal:
    distribution = normalize_goal_distribution(probabilities)
    return sum(
        (Decimal(total_goals) * probability for total_goals, probability in distribution.items()),
        Decimal("0"),
    )


def evaluate_over_offer(
    probabilities: Mapping[int, Decimal | float | str],
    line: Decimal | float | str,
    offered_odds: Decimal | float | str,
) -> MarketOfferEvaluation:
    distribution = normalize_goal_distribution(probabilities)
    line_decimal = Decimal(str(line))
    odds_decimal = Decimal(str(offered_odds))
    if odds_decimal <= 1:
        raise ValueError("Decimal odds must be greater than 1.00")

    probability_by_settlement = {
        AsianTotalSettlement.FULL_WIN: Decimal("0"),
        AsianTotalSettlement.HALF_WIN: Decimal("0"),
        AsianTotalSettlement.PUSH: Decimal("0"),
        AsianTotalSettlement.HALF_LOSS: Decimal("0"),
        AsianTotalSettlement.FULL_LOSS: Decimal("0"),
    }
    expected_pnl = Decimal("0")

    for total_goals, probability in distribution.items():
        result = settle_over_with_pnl(total_goals, line_decimal, odds_decimal)
        probability_by_settlement[result.settlement] += probability
        expected_pnl += probability * result.pnl_units

    fair_odds = _fair_odds_from_settlement_probabilities(probability_by_settlement)
    return MarketOfferEvaluation(
        line=line_decimal,
        offered_odds=odds_decimal,
        fair_odds=fair_odds,
        expected_pnl_units=expected_pnl,
        full_win_probability=probability_by_settlement[AsianTotalSettlement.FULL_WIN],
        half_win_probability=probability_by_settlement[AsianTotalSettlement.HALF_WIN],
        push_probability=probability_by_settlement[AsianTotalSettlement.PUSH],
        half_loss_probability=probability_by_settlement[AsianTotalSettlement.HALF_LOSS],
        full_loss_probability=probability_by_settlement[AsianTotalSettlement.FULL_LOSS],
    )


def rank_over_offers(
    probabilities: Mapping[int, Decimal | float | str],
    offers: tuple[OddsOffer, ...],
) -> tuple[MarketOfferEvaluation, ...]:
    """Rank quoted Overs by exact expected P/L for a supplied projection.

    This is analysis only. It does not issue LOCK/HOLD and deliberately has no access
    to the match state machine or OfficialBetModel.
    """
    evaluations = tuple(
        evaluate_over_offer(probabilities, offer.line, offer.over_odds) for offer in offers
    )
    return tuple(
        sorted(
            evaluations,
            key=lambda item: (-item.expected_pnl_units, item.line),
        )
    )


def even_money_fair_total(
    probabilities: Mapping[int, Decimal | float | str],
    *,
    minimum_line: Decimal | float | str = Decimal("0.5"),
    maximum_line: Decimal | float | str = Decimal("8.0"),
) -> FairTotalEvaluation:
    """Return the quarter line whose Over has expected P/L closest to zero at 2.00.

    This provides a deterministic definition of a distribution-derived fair Asian total
    without assuming how the upstream goal distribution was produced.
    """
    distribution = normalize_goal_distribution(probabilities)
    minimum = Decimal(str(minimum_line))
    maximum = Decimal(str(maximum_line))
    if minimum <= 0 or maximum < minimum:
        raise ValueError("Invalid fair-total search range")
    if (minimum * 4) % 1 != 0 or (maximum * 4) % 1 != 0:
        raise ValueError("Fair-total search bounds must use quarter-goal increments")

    candidates: list[MarketOfferEvaluation] = []
    line = minimum
    while line <= maximum:
        candidates.append(evaluate_over_offer(distribution, line, Decimal("2.00")))
        line += Decimal("0.25")

    selected = min(
        candidates,
        key=lambda item: (abs(item.expected_pnl_units), item.line),
    )
    return FairTotalEvaluation(
        line=selected.line,
        even_money_expected_pnl=selected.expected_pnl_units,
        projected_mean_goals=projected_mean_goals(distribution),
    )


def _fair_odds_from_settlement_probabilities(
    probabilities: Mapping[AsianTotalSettlement, Decimal],
) -> Decimal | None:
    win_weight = (
        probabilities[AsianTotalSettlement.FULL_WIN]
        + probabilities[AsianTotalSettlement.HALF_WIN] / Decimal("2")
    )
    loss_weight = (
        probabilities[AsianTotalSettlement.FULL_LOSS]
        + probabilities[AsianTotalSettlement.HALF_LOSS] / Decimal("2")
    )
    if win_weight <= 0:
        return None
    return Decimal("1") + (loss_weight / win_weight)
