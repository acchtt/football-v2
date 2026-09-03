from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

from app.football_engine.research.protection_trade_recovery import settlement_at_anchor


SUPPORTING_STATUS = "supporting_reconstruction"
HISTORICAL_STATUS = "historical_observation"
ACCEPTANCE_STATUS = "acceptance_control"
NEGATIVE_STATUSES = frozenset({"audited_upstream_miss", "audited_burden_miss"})
KNOWN_STATUSES = frozenset(
    {SUPPORTING_STATUS, HISTORICAL_STATUS, ACCEPTANCE_STATUS, *NEGATIVE_STATUSES}
)
RESEARCH_BLOCKER = "RESEARCH_ONLY_CONTEXT_DEPENDENT_PROTECTION_UTILITY_NOT_APPROVED"

FEATURE_FIELDS = (
    "structural_family",
    "carrier_dependence",
    "secondary_route_strength",
    "two_sided_strength",
    "suppression_risk",
    "failure_mode_resistance",
)

_SETTLEMENT_ORDER = {
    "full_loss": 0,
    "half_loss": 1,
    "push": 2,
    "half_win": 3,
    "full_win": 4,
}


@dataclass(frozen=True, slots=True)
class ProtectionContextObservation:
    case_id: str
    match: str
    evidence_status: str
    scope_compatible: bool
    anchor_goal: int
    lower_line: float
    lower_odds: float
    higher_line: float
    higher_odds: float
    price_gain: float
    selected_direction: str
    lower_anchor_settlement: str
    higher_anchor_settlement: str
    settlement_transition: str
    protection_steps_surrendered: int
    structural_family: str
    carrier_dependence: str
    secondary_route_strength: str
    two_sided_strength: str
    suppression_risk: str
    failure_mode_resistance: str
    ceiling_modifier: str


@dataclass(frozen=True, slots=True)
class FeatureValueSummary:
    feature: str
    value: str
    supporting_sample_count: int
    higher_count: int
    lower_count: int
    direction_status: str
    transitions: tuple[str, ...]
    price_gains: tuple[float, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class TransitionSummary:
    settlement_transition: str
    supporting_sample_count: int
    higher_count: int
    lower_count: int
    direction_status: str
    observed_structural_families: tuple[str, ...]
    observed_price_gains: tuple[float, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class ContextContradiction:
    settlement_transition: str
    smaller_gain_accepted_case: str
    smaller_gain_accepted: float
    larger_gain_rejected_case: str
    larger_gain_rejected: float
    conclusion: str = "CONTEXT_REQUIRED"


@dataclass(frozen=True, slots=True)
class ProtectionContextReport:
    case_count: int
    supporting_case_count: int
    historical_case_count: int
    acceptance_control_count: int
    negative_control_count: int
    observations: tuple[ProtectionContextObservation, ...]
    transition_summaries: tuple[TransitionSummary, ...]
    feature_summaries: tuple[FeatureValueSummary, ...]
    same_transition_contradictions: tuple[ContextContradiction, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def analyze_protection_context_cases(
    cases: Iterable[Mapping[str, Any]],
) -> ProtectionContextReport:
    """Recover context dependence in protection trades without assigning utility weights.

    The purpose is diagnostic, not predictive. A repeated directional association may
    justify a later model proposal, but this function never converts structural features
    into numeric utility, fair odds, fair totals, or a production market decision.
    """
    case_list = tuple(cases)
    if not case_list:
        raise ValueError("At least one protection-context case is required")

    observations = tuple(_observation(case) for case in case_list)
    supporting = tuple(
        observation
        for observation in observations
        if observation.evidence_status == SUPPORTING_STATUS and observation.scope_compatible
    )

    return ProtectionContextReport(
        case_count=len(observations),
        supporting_case_count=len(supporting),
        historical_case_count=sum(
            observation.evidence_status == HISTORICAL_STATUS for observation in observations
        ),
        acceptance_control_count=sum(
            observation.evidence_status == ACCEPTANCE_STATUS for observation in observations
        ),
        negative_control_count=sum(
            observation.evidence_status in NEGATIVE_STATUSES for observation in observations
        ),
        observations=observations,
        transition_summaries=_summarize_transitions(supporting),
        feature_summaries=_summarize_features(supporting),
        same_transition_contradictions=_find_same_transition_contradictions(supporting),
    )


def repeated_directional_signals(
    report: ProtectionContextReport,
    *,
    minimum_supporting_cases: int = 2,
) -> tuple[FeatureValueSummary, ...]:
    """Return repeated unanimous associations as research signals, never active rules."""
    if minimum_supporting_cases < 2:
        raise ValueError("minimum_supporting_cases must be at least 2")

    return tuple(
        summary
        for summary in report.feature_summaries
        if summary.supporting_sample_count >= minimum_supporting_cases
        and summary.direction_status in {"CONSISTENT_HIGHER", "CONSISTENT_LOWER"}
    )


def _summarize_transitions(
    observations: Sequence[ProtectionContextObservation],
) -> tuple[TransitionSummary, ...]:
    grouped: dict[str, list[ProtectionContextObservation]] = defaultdict(list)
    for observation in observations:
        grouped[observation.settlement_transition].append(observation)

    summaries: list[TransitionSummary] = []
    for transition, group in sorted(grouped.items()):
        higher = sum(observation.selected_direction == "higher" for observation in group)
        lower = sum(observation.selected_direction == "lower" for observation in group)
        summaries.append(
            TransitionSummary(
                settlement_transition=transition,
                supporting_sample_count=len(group),
                higher_count=higher,
                lower_count=lower,
                direction_status=_direction_status(higher=higher, lower=lower, sample_count=len(group)),
                observed_structural_families=tuple(
                    sorted({observation.structural_family for observation in group})
                ),
                observed_price_gains=tuple(sorted({observation.price_gain for observation in group})),
            )
        )
    return tuple(summaries)


def _summarize_features(
    observations: Sequence[ProtectionContextObservation],
) -> tuple[FeatureValueSummary, ...]:
    grouped: dict[tuple[str, str], list[ProtectionContextObservation]] = defaultdict(list)
    for observation in observations:
        for feature in FEATURE_FIELDS:
            grouped[(feature, str(getattr(observation, feature)))].append(observation)

    summaries: list[FeatureValueSummary] = []
    for (feature, value), group in sorted(grouped.items()):
        higher = sum(observation.selected_direction == "higher" for observation in group)
        lower = sum(observation.selected_direction == "lower" for observation in group)
        summaries.append(
            FeatureValueSummary(
                feature=feature,
                value=value,
                supporting_sample_count=len(group),
                higher_count=higher,
                lower_count=lower,
                direction_status=_direction_status(higher=higher, lower=lower, sample_count=len(group)),
                transitions=tuple(sorted({observation.settlement_transition for observation in group})),
                price_gains=tuple(sorted({observation.price_gain for observation in group})),
            )
        )
    return tuple(summaries)


def _find_same_transition_contradictions(
    observations: Sequence[ProtectionContextObservation],
) -> tuple[ContextContradiction, ...]:
    by_transition: dict[str, list[ProtectionContextObservation]] = defaultdict(list)
    for observation in observations:
        if observation.protection_steps_surrendered > 0:
            by_transition[observation.settlement_transition].append(observation)

    contradictions: list[ContextContradiction] = []
    for transition, group in sorted(by_transition.items()):
        accepted = [observation for observation in group if observation.selected_direction == "higher"]
        rejected = [observation for observation in group if observation.selected_direction == "lower"]
        for accepted_observation in accepted:
            for rejected_observation in rejected:
                if accepted_observation.price_gain < rejected_observation.price_gain:
                    contradictions.append(
                        ContextContradiction(
                            settlement_transition=transition,
                            smaller_gain_accepted_case=accepted_observation.case_id,
                            smaller_gain_accepted=accepted_observation.price_gain,
                            larger_gain_rejected_case=rejected_observation.case_id,
                            larger_gain_rejected=rejected_observation.price_gain,
                        )
                    )
    return tuple(
        sorted(
            contradictions,
            key=lambda item: (
                item.settlement_transition,
                item.smaller_gain_accepted,
                item.larger_gain_rejected,
                item.smaller_gain_accepted_case,
                item.larger_gain_rejected_case,
            ),
        )
    )


def _direction_status(*, higher: int, lower: int, sample_count: int) -> str:
    if sample_count <= 1:
        return "SPARSE"
    if higher and not lower:
        return "CONSISTENT_HIGHER"
    if lower and not higher:
        return "CONSISTENT_LOWER"
    return "MIXED"


def _observation(case: Mapping[str, Any]) -> ProtectionContextObservation:
    _validate_case(case)
    anchor_goal = int(case["anchor_goal"])
    lower_line = float(case["lower_line"])
    higher_line = float(case["higher_line"])
    lower_odds = float(case["lower_odds"])
    higher_odds = float(case["higher_odds"])
    selected_line = float(case["selected_line"])

    lower_settlement = settlement_at_anchor(anchor_goal=anchor_goal, over_line=lower_line)
    higher_settlement = settlement_at_anchor(anchor_goal=anchor_goal, over_line=higher_line)
    protection_steps = _SETTLEMENT_ORDER[lower_settlement] - _SETTLEMENT_ORDER[higher_settlement]

    return ProtectionContextObservation(
        case_id=str(case["case_id"]),
        match=str(case["match"]),
        evidence_status=str(case["evidence_status"]),
        scope_compatible=bool(case["scope_compatible"]),
        anchor_goal=anchor_goal,
        lower_line=lower_line,
        lower_odds=lower_odds,
        higher_line=higher_line,
        higher_odds=higher_odds,
        price_gain=round(higher_odds - lower_odds, 2),
        selected_direction="higher" if selected_line == higher_line else "lower",
        lower_anchor_settlement=lower_settlement,
        higher_anchor_settlement=higher_settlement,
        settlement_transition=f"{lower_settlement}_to_{higher_settlement}",
        protection_steps_surrendered=protection_steps,
        structural_family=str(case["structural_family"]),
        carrier_dependence=str(case["carrier_dependence"]),
        secondary_route_strength=str(case["secondary_route_strength"]),
        two_sided_strength=str(case["two_sided_strength"]),
        suppression_risk=str(case["suppression_risk"]),
        failure_mode_resistance=str(case["failure_mode_resistance"]),
        ceiling_modifier=str(case["ceiling_modifier"]),
    )


def _validate_case(case: Mapping[str, Any]) -> None:
    required = (
        "case_id",
        "source_reference",
        "match",
        "evidence_status",
        "scope_compatible",
        "anchor_goal",
        "lower_line",
        "lower_odds",
        "higher_line",
        "higher_odds",
        "selected_line",
        "structural_family",
        "carrier_dependence",
        "secondary_route_strength",
        "two_sided_strength",
        "suppression_risk",
        "failure_mode_resistance",
        "ceiling_modifier",
        "normalization_basis",
    )
    missing = [field for field in required if field not in case]
    if missing:
        raise ValueError(f"Protection-context case missing fields: {', '.join(missing)}")

    case_id = str(case["case_id"])
    if not case_id or not str(case["source_reference"]):
        raise ValueError("case_id and source_reference cannot be empty")
    if not str(case["normalization_basis"]):
        raise ValueError(f"{case_id}: normalization_basis cannot be empty")

    status = str(case["evidence_status"])
    if status not in KNOWN_STATUSES:
        raise ValueError(f"{case_id}: unknown evidence_status {status!r}")

    lower_line = float(case["lower_line"])
    higher_line = float(case["higher_line"])
    selected_line = float(case["selected_line"])
    if not (_is_quarter_line(lower_line) and _is_quarter_line(higher_line)):
        raise ValueError(f"{case_id}: lines must be quarter-goal lines")
    if round(higher_line - lower_line, 2) != 0.25:
        raise ValueError(f"{case_id}: comparison must be adjacent quarter-lines")
    if selected_line not in {lower_line, higher_line}:
        raise ValueError(f"{case_id}: selected_line must equal one compared line")

    lower_odds = float(case["lower_odds"])
    higher_odds = float(case["higher_odds"])
    if lower_odds <= 1.0 or higher_odds <= lower_odds:
        raise ValueError(f"{case_id}: higher line must have a positive price gain")

    for feature in FEATURE_FIELDS:
        if not str(case[feature]):
            raise ValueError(f"{case_id}: {feature} cannot be empty")


def _is_quarter_line(value: float) -> bool:
    return abs(value * 4 - round(value * 4)) < 0.000001
