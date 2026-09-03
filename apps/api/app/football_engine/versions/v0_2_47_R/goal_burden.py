from dataclasses import dataclass

from app.model_state import get_model_state

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
) -> GoalBurdenResult:
    state = get_model_state().market
    maximum_line = state.maximum_line_by_grade[grade.value]
    extension = state.a1_extended_line
    if (
        grade is StructuralGrade.A1
        and extension.enabled
        and structural_score >= extension.minimum_structural_score
        and (not extension.requires_positive_xi_delta or xi_band_delta > 0)
    ):
        maximum_line = extension.maximum_line

    acceptable = [
        offer
        for offer in offers
        if offer.line <= maximum_line
        and state.minimum_price <= offer.over_odds <= state.maximum_price
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
