from dataclasses import dataclass

from .types import StructuralGrade


@dataclass(frozen=True, slots=True)
class OddsOffer:
    line: float
    over_odds: float
    under_odds: float


@dataclass(frozen=True, slots=True)
class GoalBurdenResult:
    selected: OddsOffer | None
    maximum_line: float
    reason: str


def select_protected_line(
    grade: StructuralGrade,
    structural_score: float,
    xi_band_delta: int,
    offers: tuple[OddsOffer, ...],
    minimum_price: float = 1.60,
    maximum_price: float = 2.30,
) -> GoalBurdenResult:
    maximum_line = {
        StructuralGrade.A1: 3.0,
        StructuralGrade.A2: 3.0,
        StructuralGrade.B_PLUS: 2.75,
        StructuralGrade.B: 2.5,
        StructuralGrade.PASS: 2.5,
    }[grade]
    if grade is StructuralGrade.A1 and structural_score >= 92 and xi_band_delta > 0:
        maximum_line = 3.5

    acceptable = [
        offer
        for offer in offers
        if offer.line <= maximum_line and minimum_price <= offer.over_odds <= maximum_price
    ]
    if not acceptable:
        return GoalBurdenResult(
            selected=None,
            maximum_line=maximum_line,
            reason=(f"no protected line at or below O{maximum_line:g} has an acceptable price"),
        )

    # Protection is primary. Price only breaks ties at the same goal burden.
    selected = sorted(acceptable, key=lambda offer: (offer.line, -offer.over_odds))[0]
    return GoalBurdenResult(
        selected=selected,
        maximum_line=maximum_line,
        reason=f"O{selected.line:g} preserves the lowest acceptable goal burden",
    )
