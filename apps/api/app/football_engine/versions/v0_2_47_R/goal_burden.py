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
    maximum_line: float | None
    reason: str


def select_protected_line(
    grade: StructuralGrade,
    structural_score: float,
    xi_band_delta: int,
    offers: tuple[OddsOffer, ...],
) -> GoalBurdenResult:
    """Legacy calibration helper for protected Asian-total burden.

    Production LOCK/HOLD remains disabled until the approved projected-goal-distribution
    and fair-market comparison chain exists. The restored PRE-HARDENING model has no
    blanket grade-based maximum line: structure must validate burden before market
    comparison, while price eligibility still follows canonical state.
    """
    del grade, structural_score, xi_band_delta

    state = get_model_state().market
    acceptable = [
        offer
        for offer in offers
        if state.minimum_price <= offer.over_odds <= state.maximum_price
    ]
    if not acceptable:
        return GoalBurdenResult(
            selected=None,
            maximum_line=None,
            reason=(
                f"no market line is inside the canonical price range "
                f"{state.minimum_price:.2f}-{state.maximum_price:.2f}"
            ),
        )

    # This helper only preserves settlement protection among price-eligible offers.
    # It is not the final market selector: fair-total/projection logic must decide
    # whether the resulting burden is structurally justified before any production lock.
    selected = sorted(acceptable, key=lambda offer: (offer.line, -offer.over_odds))[0]
    return GoalBurdenResult(
        selected=selected,
        maximum_line=None,
        reason=(
            f"O{selected.line:g} is the lowest price-eligible protected burden; "
            "projection approval is still required"
        ),
    )
