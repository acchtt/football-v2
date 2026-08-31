from dataclasses import dataclass

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
    xi = rerank_xi(input_data.frozen_grade, input_data.xi_signals)
    failures = evaluate_xi_failure_modes(
        input_data.xi_signals,
        input_data.frozen_failure_modes,
    )
    profile_pass = input_data.profile_gate_score >= 55
    chance_pass = input_data.chance_quality_score >= 55
    reasons = list(xi.reasons) + list(failures.reasons)

    if input_data.lineup_confidence < 0.70 or input_data.odds_confidence < 0.70:
        reasons.append("screenshot extraction confidence is below 70%")
    if not input_data.screenshots_match_fixture:
        reasons.append("uploaded screenshots do not reliably match the frozen fixture")
    if not profile_pass:
        reasons.append("mandatory GF/GA profile gate failed")
    if not chance_pass:
        reasons.append("repeatable chance-quality gate failed")

    eligible_grade = xi.xi_grade in {StructuralGrade.A1, StructuralGrade.A2}
    prerequisites_pass = all(
        (
            input_data.lineup_confidence >= 0.70,
            input_data.odds_confidence >= 0.70,
            input_data.screenshots_match_fixture,
            profile_pass,
            chance_pass,
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
        profile_gate="PASS" if profile_pass else "FAIL",
        chance_quality_gate="PASS" if chance_pass else "FAIL",
        failure_modes_acceptable=failures.acceptable,
        selected_line=burden.selected.line if locked and burden.selected else None,
        selected_odds=burden.selected.over_odds if locked and burden.selected else None,
        verdict="OFFICIAL LOCK" if locked else "NO BET — HOLD",
        reasons=tuple(dict.fromkeys(reasons)),
        xi_band_delta=xi.band_delta,
    )
