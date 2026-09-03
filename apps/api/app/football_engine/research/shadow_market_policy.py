from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Mapping, Any

from app.football_engine.research.protection_trade_recovery import settlement_at_anchor


RESEARCH_BLOCKER = "RESEARCH_ONLY_SHADOW_MARKET_POLICY_NOT_APPROVED"
_SETTLEMENT_RANK = {"full_loss": 0, "half_loss": 1, "push": 2, "half_win": 3, "full_win": 4}


class ProtectionPosture(str, Enum):
    PROTECTION_HEAVY = "PROTECTION_HEAVY"
    BALANCED = "BALANCED"
    PRICE_TOLERANT = "PRICE_TOLERANT"
    UNRESOLVED = "UNRESOLVED"


@dataclass(frozen=True, slots=True)
class ShadowOffer:
    line: float
    odds: float
    anchor_settlement: str
    anchor_rank: int
    allowed: bool
    reason: str


@dataclass(frozen=True, slots=True)
class ShadowMarketEnvelope:
    anchor_goal: int
    posture: ProtectionPosture
    eligible_offer_count: int
    allowed_offers: tuple[ShadowOffer, ...]
    rejected_offers: tuple[ShadowOffer, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def classify_protection_posture(context: Mapping[str, Any]) -> ProtectionPosture:
    """Map recovered categorical context to a shadow protection posture.

    This is deliberately ordinal rather than numeric. It does not estimate fair value,
    choose a line, or authorize a verdict.
    """
    carrier = str(context.get("carrier_dependence", "unknown"))
    secondary = str(context.get("secondary_route_strength", "unknown"))
    two_sided = str(context.get("two_sided_strength", "unknown"))
    suppression = str(context.get("suppression_risk", "unknown"))
    resistance = str(context.get("failure_mode_resistance", "unknown"))

    if (
        carrier == "high"
        or secondary in {"weak", "unproven"}
        or two_sided == "weak"
        or suppression == "high"
        or resistance == "low"
    ):
        return ProtectionPosture.PROTECTION_HEAVY

    if (
        carrier == "low"
        and secondary == "credible"
        and two_sided in {"credible", "strong"}
        and suppression == "low"
        and resistance == "high"
    ):
        return ProtectionPosture.PRICE_TOLERANT

    known = {carrier, secondary, two_sided, suppression, resistance}
    if "unknown" in known:
        return ProtectionPosture.UNRESOLVED
    return ProtectionPosture.BALANCED


def build_shadow_market_envelope(
    *,
    anchor_goal: int,
    posture: ProtectionPosture,
    offers: Iterable[tuple[float, float]],
    minimum_price: float = 1.70,
    maximum_price: float = 2.30,
) -> ShadowMarketEnvelope:
    """Return allowed offers under a categorical settlement-protection envelope.

    The envelope only removes burdens that are inconsistent with the recovered posture.
    It intentionally does not rank the surviving offers.
    """
    if posture == ProtectionPosture.UNRESOLVED:
        return ShadowMarketEnvelope(anchor_goal, posture, 0, (), ())

    eligible: list[tuple[float, float, str, int]] = []
    for line, odds in offers:
        line = float(line)
        odds = float(odds)
        if minimum_price <= odds <= maximum_price:
            settlement = settlement_at_anchor(anchor_goal=anchor_goal, over_line=line)
            eligible.append((line, odds, settlement, _SETTLEMENT_RANK[settlement]))

    if not eligible:
        return ShadowMarketEnvelope(anchor_goal, posture, 0, (), ())

    best_rank = max(item[3] for item in eligible)
    tolerance = {
        ProtectionPosture.PROTECTION_HEAVY: 0,
        ProtectionPosture.BALANCED: 1,
        ProtectionPosture.PRICE_TOLERANT: 2,
    }[posture]
    minimum_rank = max(0, best_rank - tolerance)

    allowed: list[ShadowOffer] = []
    rejected: list[ShadowOffer] = []
    for line, odds, settlement, rank in eligible:
        ok = rank >= minimum_rank
        observation = ShadowOffer(
            line=line,
            odds=odds,
            anchor_settlement=settlement,
            anchor_rank=rank,
            allowed=ok,
            reason=(
                f"anchor rank {rank} within {tolerance} step(s) of best rank {best_rank}"
                if ok
                else f"anchor rank {rank} exceeds posture tolerance from best rank {best_rank}"
            ),
        )
        (allowed if ok else rejected).append(observation)

    return ShadowMarketEnvelope(
        anchor_goal=anchor_goal,
        posture=posture,
        eligible_offer_count=len(eligible),
        allowed_offers=tuple(allowed),
        rejected_offers=tuple(rejected),
    )
