from dataclasses import dataclass

from app.model_state import get_model_state

from .failure_modes import evaluate_xi_failure_modes
from .goal_burden import OddsOffer, select_protected_line
from .types import StructuralGrade
from .xi_rerank import XISignalsInput, rerank_xi


@dataclass(frozen=True, slots=True)
class VerdictInput:
    frozen_grade: StructuralGrade
    structural_score: float
    profile_gate_score: float
    chance_quality_score: float
    frozen_failure_modes: tuple[str, ...]
    lineup_confidence: float
    odds_confidence: float
    screenshots_match_fixture: bool
    xi_signals: XISignalsInput
    odds_offers: tuple[OddsOffer, ...]


@dataclass(frozen=True, slots=True)
class VerdictResult:
    frozen_grade: StructuralGrade
    xi_grade: StructuralGrade
    profile_gate: str
    chance_quality_gate: str
    failure_modes_acceptable: bool
    selected_line: float | None
    selected_odds: float | None
    verdict: str
    reasons: tuple[str, ...]
    xi_band_delta: int


def decide(input_data: VerdictInput) -> VerdictResult:
    state = get_model_state()
    confidence_floor = state.market.minimum_extraction_confidence
    xi = rerank_xi(input_data.frozen_grade, input_data.xi_signals)
    failures = evaluate_xi_failure_modes(
        input_data.xi_signals,
        input_data.frozen_failure_modes,
    )
    reasons = list(xi.reasons) + list(failures.reasons)

    if input_data.lineup_confidence < confidence_floor or input_data.odds_confidence < confidence_floor:
        reasons.append(
            f"screenshot extraction confidence is below {confidence_floor:.0%}"
        )
    if not input_data.screenshots_match_fixture:
        reasons.append("uploaded screenshots do not reliably match the frozen fixture")

    # PRE-HARDENING: profile/chance quality already influenced the frozen structural score.
    # They remain visible evidence here, but are not re-applied as blanket numeric vetoes.
    if input_data.chance_quality_score < 55:
        reasons.append("chance-quality support is weak; prefer protection or HOLD if burden stretches")
    if input_data.profile_gate_score < 55:
        reasons.append("underlying scoring profile is weak despite the frozen route score")

    eligible_grade = xi.xi_grade in {StructuralGrade.A1, StructuralGrade.A2}
    prerequisites_pass = all(
        (
            input_data.lineup_confidence >= confidence_floor,
            input_data.odds_confidence >= confidence_floor,
            input_data.screenshots_match_fixture,
            failures.acceptable,
            eligible_grade,
        )
    )
    burden = select_protected_line(
        xi.xi_grade,
        input_data.structural_score,
        xi.band_delta,
        input_data.odds_offers,
    )
    reasons.append(burden.reason)
    if not eligible_grade:
        reasons.append("confirmed XI grade remains below A2")

    locked = prerequisites_pass and burden.selected is not None
    return VerdictResult(
        frozen_grade=input_data.frozen_grade,
        xi_grade=xi.xi_grade,
        profile_gate="WEIGHTED EVIDENCE",
        chance_quality_gate="SUPPORTING MODIFIER",
        failure_modes_acceptable=failures.acceptable,
        selected_line=burden.selected.line if locked and burden.selected else None,
        selected_odds=burden.selected.over_odds if locked and burden.selected else None,
        verdict="OFFICIAL LOCK" if locked else "NO BET — HOLD",
        reasons=tuple(dict.fromkeys(reasons)),
        xi_band_delta=xi.band_delta,
    )
