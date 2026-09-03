from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


SUPPORTING_STATUS = "supporting_reconstruction"
HISTORICAL_STATUS = "historical_observation"
ACCEPTANCE_STATUS = "acceptance_control"
NEGATIVE_STATUSES = frozenset({"audited_upstream_miss", "audited_burden_miss"})
KNOWN_STATUSES = frozenset(
    {SUPPORTING_STATUS, HISTORICAL_STATUS, ACCEPTANCE_STATUS, *NEGATIVE_STATUSES}
)
KNOWN_DRIVERS = frozenset({"protection_vs_price", "price_floor_elimination"})
RESEARCH_BLOCKER = "RESEARCH_ONLY_PROTECTION_PRICE_POLICY_NOT_APPROVED"

_SETTLEMENT_ORDER = {
    "full_loss": 0,
    "half_loss": 1,
    "push": 2,
    "half_win": 3,
    "full_win": 4,
}


@dataclass(frozen=True, slots=True)
class TradeObservation:
    case_id: str
    context_tag: str
    anchor_goal: int
    lower_line: float
    lower_odds: float
    higher_line: float
    higher_odds: float
    price_gain: float
    lower_eligible: bool
    higher_eligible: bool
    lower_anchor_settlement: str
    higher_anchor_settlement: str
    protection_steps_surrendered: int
    selected_direction: str
    decision_driver: str
    evidence_status: str
    scope_compatible: bool


@dataclass(frozen=True, slots=True)
class FixedThresholdDiagnostic:
    sample_count: int
    accepted_price_gains: tuple[float, ...]
    rejected_price_gains: tuple[float, ...]
    minimum_accepted_gain: float | None
    maximum_rejected_gain: float | None
    fixed_threshold_possible: bool
    explanation: str


@dataclass(frozen=True, slots=True)
class ProtectionTradeReport:
    case_count: int
    supporting_case_count: int
    acceptance_control_count: int
    negative_control_count: int
    floor_elimination_count: int
    observations: tuple[TradeObservation, ...]
    supporting_threshold_diagnostic: FixedThresholdDiagnostic
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def analyze_protection_trade_cases(
    cases: Iterable[Mapping[str, Any]],
) -> ProtectionTradeReport:
    """Recover historical quarter-line protection/price trades without selecting a line.

    This layer deliberately does not estimate probabilities, fair odds, fair totals, or
    production verdicts. It asks a narrower question: when an adjacent higher Over line
    paid more but surrendered settlement protection at a recovered integer goal anchor,
    did historical v0.2.47-R behavior accept or reject that trade?
    """
    case_list = tuple(cases)
    if not case_list:
        raise ValueError("At least one protection-trade case is required")

    observations = tuple(_observation(case) for case in case_list)
    supporting = tuple(
        observation
        for observation in observations
        if observation.evidence_status == SUPPORTING_STATUS
        and observation.scope_compatible
        and observation.decision_driver == "protection_vs_price"
        and observation.lower_eligible
        and observation.higher_eligible
        and observation.protection_steps_surrendered == 1
    )

    return ProtectionTradeReport(
        case_count=len(observations),
        supporting_case_count=sum(
            observation.evidence_status == SUPPORTING_STATUS for observation in observations
        ),
        acceptance_control_count=sum(
            observation.evidence_status == ACCEPTANCE_STATUS for observation in observations
        ),
        negative_control_count=sum(
            observation.evidence_status in NEGATIVE_STATUSES for observation in observations
        ),
        floor_elimination_count=sum(
            observation.decision_driver == "price_floor_elimination"
            for observation in observations
        ),
        observations=observations,
        supporting_threshold_diagnostic=diagnose_fixed_price_threshold(supporting),
    )


def diagnose_fixed_price_threshold(
    observations: Iterable[TradeObservation],
) -> FixedThresholdDiagnostic:
    """Test the simple rule: move up one protection step iff price gain >= threshold."""
    observations = tuple(observations)
    accepted = tuple(
        sorted(
            observation.price_gain
            for observation in observations
            if observation.selected_direction == "higher"
        )
    )
    rejected = tuple(
        sorted(
            observation.price_gain
            for observation in observations
            if observation.selected_direction == "lower"
        )
    )

    min_accepted = min(accepted) if accepted else None
    max_rejected = max(rejected) if rejected else None

    if not accepted or not rejected:
        possible = True
        explanation = "Insufficient opposite-direction observations to falsify a fixed threshold."
    else:
        possible = max_rejected < min_accepted
        if possible:
            explanation = (
                "A separating threshold is arithmetically possible in this sample, but is not "
                "an approved model rule."
            )
        else:
            explanation = (
                "No fixed price-gain threshold can reproduce the sample: at least one smaller "
                "gain was accepted while a larger gain was rejected. Context is therefore required."
            )

    return FixedThresholdDiagnostic(
        sample_count=len(observations),
        accepted_price_gains=accepted,
        rejected_price_gains=rejected,
        minimum_accepted_gain=min_accepted,
        maximum_rejected_gain=max_rejected,
        fixed_threshold_possible=possible,
        explanation=explanation,
    )


def settlement_at_anchor(*, anchor_goal: int, over_line: float) -> str:
    """Return the exact Asian Over settlement category at an integer total-goal anchor."""
    offset = round(anchor_goal - over_line, 2)
    if offset >= 0.5:
        return "full_win"
    if offset == 0.25:
        return "half_win"
    if offset == 0.0:
        return "push"
    if offset == -0.25:
        return "half_loss"
    return "full_loss"


def _observation(case: Mapping[str, Any]) -> TradeObservation:
    _validate_case(case)
    anchor_goal = int(case["anchor_goal"])
    lower_line = float(case["lower_line"])
    lower_odds = float(case["lower_odds"])
    higher_line = float(case["higher_line"])
    higher_odds = float(case["higher_odds"])
    minimum_price = float(case["minimum_price"])
    selected_line = float(case["selected_line"])

    lower_settlement = settlement_at_anchor(anchor_goal=anchor_goal, over_line=lower_line)
    higher_settlement = settlement_at_anchor(anchor_goal=anchor_goal, over_line=higher_line)
    protection_steps = _SETTLEMENT_ORDER[lower_settlement] - _SETTLEMENT_ORDER[higher_settlement]

    return TradeObservation(
        case_id=str(case["case_id"]),
        context_tag=str(case["context_tag"]),
        anchor_goal=anchor_goal,
        lower_line=lower_line,
        lower_odds=lower_odds,
        higher_line=higher_line,
        higher_odds=higher_odds,
        price_gain=round(higher_odds - lower_odds, 2),
        lower_eligible=lower_odds >= minimum_price,
        higher_eligible=higher_odds >= minimum_price,
        lower_anchor_settlement=lower_settlement,
        higher_anchor_settlement=higher_settlement,
        protection_steps_surrendered=protection_steps,
        selected_direction="higher" if selected_line == higher_line else "lower",
        decision_driver=str(case["decision_driver"]),
        evidence_status=str(case["evidence_status"]),
        scope_compatible=bool(case["scope_compatible"]),
    )


def _validate_case(case: Mapping[str, Any]) -> None:
    required = (
        "case_id",
        "source_reference",
        "match",
        "context_tag",
        "anchor_goal",
        "lower_line",
        "lower_odds",
        "higher_line",
        "higher_odds",
        "selected_line",
        "minimum_price",
        "decision_driver",
        "scope_compatible",
        "evidence_status",
    )
    missing = [field for field in required if field not in case]
    if missing:
        raise ValueError(f"Protection-trade case missing fields: {', '.join(missing)}")

    case_id = str(case["case_id"])
    if not case_id or not str(case["source_reference"]):
        raise ValueError("case_id and source_reference cannot be empty")

    status = str(case["evidence_status"])
    if status not in KNOWN_STATUSES:
        raise ValueError(f"{case_id}: unknown evidence_status {status!r}")
    driver = str(case["decision_driver"])
    if driver not in KNOWN_DRIVERS:
        raise ValueError(f"{case_id}: unknown decision_driver {driver!r}")

    lower_line = float(case["lower_line"])
    higher_line = float(case["higher_line"])
    if not (_is_quarter_line(lower_line) and _is_quarter_line(higher_line)):
        raise ValueError(f"{case_id}: lines must be quarter-goal lines")
    if round(higher_line - lower_line, 2) != 0.25:
        raise ValueError(f"{case_id}: comparison must be one adjacent quarter-line step")

    lower_odds = float(case["lower_odds"])
    higher_odds = float(case["higher_odds"])
    if lower_odds <= 1.0 or higher_odds <= 1.0:
        raise ValueError(f"{case_id}: odds must exceed 1.0")
    if higher_odds <= lower_odds:
        raise ValueError(f"{case_id}: higher line must pay more in a protection trade")

    selected_line = float(case["selected_line"])
    if selected_line not in {lower_line, higher_line}:
        raise ValueError(f"{case_id}: selected_line must equal lower_line or higher_line")

    if int(case["anchor_goal"]) < 0:
        raise ValueError(f"{case_id}: anchor_goal cannot be negative")
    if float(case["minimum_price"]) <= 1.0:
        raise ValueError(f"{case_id}: minimum_price must exceed 1.0")


def _is_quarter_line(value: float) -> bool:
    return abs(value * 4 - round(value * 4)) < 0.000001
