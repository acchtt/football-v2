from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Mapping, Iterable

from app.football_engine.research.shadow_market_policy import (
    ProtectionPosture,
    ShadowMarketEnvelope,
    build_shadow_market_envelope,
    classify_protection_posture,
)
from app.football_engine.versions.v0_2_47_R.market_math import (
    MarketOfferEvaluation,
    even_money_fair_total,
    evaluate_over_offer,
    projected_mean_goals,
)


RESEARCH_BLOCKER = "RESEARCH_ONLY_END_TO_END_CHAIN_NOT_APPROVED"


@dataclass(frozen=True, slots=True)
class ShadowCandidateDiagnostic:
    line: Decimal
    odds: Decimal
    expected_pnl_units: Decimal
    fair_odds: Decimal | None
    full_win_probability: Decimal
    half_win_probability: Decimal
    push_probability: Decimal
    half_loss_probability: Decimal
    full_loss_probability: Decimal
    ev_rank_within_envelope: int


@dataclass(frozen=True, slots=True)
class ShadowDecisionChainResult:
    anchor_goal: int
    posture: ProtectionPosture
    projected_mean_goals: Decimal
    fair_total_line: Decimal
    envelope: ShadowMarketEnvelope
    candidates: tuple[ShadowCandidateDiagnostic, ...]
    top_ev_line: Decimal | None
    top_ev_odds: Decimal | None
    official_selection: None = None
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def run_shadow_decision_chain(
    *,
    context: Mapping[str, Any],
    anchor_goal: int,
    goal_distribution: Mapping[int, Decimal | float | str],
    offers: Iterable[tuple[float, float]],
    posture: ProtectionPosture | None = None,
    minimum_price: float = 1.70,
    maximum_price: float = 2.30,
) -> ShadowDecisionChainResult:
    """Compose recovered context, anchor, policy envelope, and exact Asian math.

    The supplied goal distribution must come from an external/research projection layer;
    this function never invents probabilities. Top EV is diagnostic only and cannot
    become an official selection.
    """
    resolved_posture = posture or classify_protection_posture(context)
    offer_tuple = tuple((float(line), float(odds)) for line, odds in offers)
    envelope = build_shadow_market_envelope(
        anchor_goal=anchor_goal,
        posture=resolved_posture,
        offers=offer_tuple,
        minimum_price=minimum_price,
        maximum_price=maximum_price,
    )

    evaluations: list[MarketOfferEvaluation] = []
    for offer in envelope.allowed_offers:
        evaluations.append(evaluate_over_offer(goal_distribution, offer.line, offer.odds))
    evaluations.sort(key=lambda item: (-item.expected_pnl_units, item.line))

    candidates = tuple(
        ShadowCandidateDiagnostic(
            line=item.line,
            odds=item.offered_odds,
            expected_pnl_units=item.expected_pnl_units,
            fair_odds=item.fair_odds,
            full_win_probability=item.full_win_probability,
            half_win_probability=item.half_win_probability,
            push_probability=item.push_probability,
            half_loss_probability=item.half_loss_probability,
            full_loss_probability=item.full_loss_probability,
            ev_rank_within_envelope=index,
        )
        for index, item in enumerate(evaluations, start=1)
    )
    fair_total = even_money_fair_total(goal_distribution)

    return ShadowDecisionChainResult(
        anchor_goal=anchor_goal,
        posture=resolved_posture,
        projected_mean_goals=projected_mean_goals(goal_distribution),
        fair_total_line=fair_total.line,
        envelope=envelope,
        candidates=candidates,
        top_ev_line=candidates[0].line if candidates else None,
        top_ev_odds=candidates[0].odds if candidates else None,
    )
