from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


SUPPORTING_STATUS = "supporting_reconstruction"
ACCEPTANCE_STATUS = "acceptance_control"
HISTORICAL_ONLY_STATUS = "historical_forecast_only"
NEGATIVE_STATUSES = frozenset({"audited_structure_miss", "audited_burden_miss"})
KNOWN_STATUSES = frozenset(
    {
        SUPPORTING_STATUS,
        ACCEPTANCE_STATUS,
        HISTORICAL_ONLY_STATUS,
        *NEGATIVE_STATUSES,
    }
)
KNOWN_ANCHOR_ROLES = frozenset(
    {
        "explicit_central_outcome",
        "protected_integer_boundary",
        "acceptance_boundary",
        "audited_overstretch_boundary",
    }
)
RESEARCH_BLOCKER = "RESEARCH_ONLY_CENTRAL_OUTCOME_MAPPING_NOT_APPROVED"


@dataclass(frozen=True, slots=True)
class CentralOutcomeGroupSummary:
    structural_family: str
    historical_sample_count: int
    supporting_sample_count: int
    acceptance_control_count: int
    negative_control_count: int
    historical_anchor_goals: tuple[int, ...]
    supporting_anchor_goals: tuple[int, ...]
    historical_selected_line_offsets: tuple[float, ...]
    supporting_selected_line_offsets: tuple[float, ...]
    historical_mapping_consistent: bool
    supporting_mapping_status: str
    expression_diversity_status: str
    non_lowest_selection_count: int
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class CentralOutcomeRecoveryReport:
    case_count: int
    supporting_case_count: int
    acceptance_control_count: int
    negative_control_count: int
    non_lowest_selection_count: int
    groups: tuple[CentralOutcomeGroupSummary, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def analyze_central_outcome_cases(
    cases: Iterable[Mapping[str, Any]],
) -> CentralOutcomeRecoveryReport:
    """Recover integer goal anchors without turning them into a pricing model.

    ``anchor_goal`` is the integer total the historical decision treated as a central
    or settlement-critical outcome. It is deliberately separate from ``selected_line``:
    the same anchor can support O2.5, O2.75, O3.0, or another expression depending on
    price and protection. The analyzer reports recurrence only; it never emits a fair
    total, probability, EV, or production verdict.
    """
    case_list = tuple(cases)
    if not case_list:
        raise ValueError("At least one central-outcome case is required")

    by_family: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    supporting_count = 0
    acceptance_count = 0
    negative_count = 0
    non_lowest_count = 0

    for case in case_list:
        family, status = _validate_case(case)
        by_family[family].append(case)
        supporting_count += status == SUPPORTING_STATUS
        acceptance_count += status == ACCEPTANCE_STATUS
        negative_count += status in NEGATIVE_STATUSES
        non_lowest_count += _is_non_lowest_selection(case)

    groups = tuple(
        _summarize_group(family, group_cases)
        for family, group_cases in sorted(by_family.items())
    )
    return CentralOutcomeRecoveryReport(
        case_count=len(case_list),
        supporting_case_count=supporting_count,
        acceptance_control_count=acceptance_count,
        negative_control_count=negative_count,
        non_lowest_selection_count=non_lowest_count,
        groups=groups,
    )


def sufficiently_supported_anchor_groups(
    report: CentralOutcomeRecoveryReport,
    *,
    minimum_supporting_cases: int = 3,
) -> tuple[CentralOutcomeGroupSummary, ...]:
    """Return repeated research anchors that could justify a future proposal.

    Even returned groups remain research-only. A repeated integer anchor is not a fair
    total and does not authorize market comparison or LOCK/HOLD production behavior.
    """
    if minimum_supporting_cases < 2:
        raise ValueError("minimum_supporting_cases must be at least 2")

    return tuple(
        group
        for group in report.groups
        if group.supporting_sample_count >= minimum_supporting_cases
        and group.supporting_mapping_status == "CONSISTENT"
    )


def _summarize_group(
    family: str,
    cases: Sequence[Mapping[str, Any]],
) -> CentralOutcomeGroupSummary:
    supporting_cases = tuple(
        case
        for case in cases
        if case["evidence_status"] == SUPPORTING_STATUS and bool(case["scope_compatible"])
    )
    historical_anchors = tuple(sorted({int(case["anchor_goal"]) for case in cases}))
    supporting_anchors = tuple(
        sorted({int(case["anchor_goal"]) for case in supporting_cases})
    )
    historical_offsets = tuple(sorted({_line_offset(case) for case in cases}))
    supporting_offsets = tuple(sorted({_line_offset(case) for case in supporting_cases}))

    if not supporting_cases:
        supporting_status = "NO_SUPPORTING_EVIDENCE"
    elif len(supporting_cases) == 1:
        supporting_status = "SPARSE"
    elif len(supporting_anchors) == 1:
        supporting_status = "CONSISTENT"
    else:
        supporting_status = "CONTRADICTORY"

    if not supporting_offsets:
        diversity_status = "NO_SUPPORTING_EVIDENCE"
    elif len(supporting_offsets) == 1:
        diversity_status = "SINGLE_EXPRESSION"
    else:
        diversity_status = "MULTIPLE_EXPRESSIONS"

    return CentralOutcomeGroupSummary(
        structural_family=family,
        historical_sample_count=len(cases),
        supporting_sample_count=len(supporting_cases),
        acceptance_control_count=sum(
            case["evidence_status"] == ACCEPTANCE_STATUS for case in cases
        ),
        negative_control_count=sum(
            case["evidence_status"] in NEGATIVE_STATUSES for case in cases
        ),
        historical_anchor_goals=historical_anchors,
        supporting_anchor_goals=supporting_anchors,
        historical_selected_line_offsets=historical_offsets,
        supporting_selected_line_offsets=supporting_offsets,
        historical_mapping_consistent=len(historical_anchors) == 1,
        supporting_mapping_status=supporting_status,
        expression_diversity_status=diversity_status,
        non_lowest_selection_count=sum(_is_non_lowest_selection(case) for case in cases),
    )


def _validate_case(case: Mapping[str, Any]) -> tuple[str, str]:
    required = (
        "case_id",
        "source_reference",
        "structural_family",
        "structural_label",
        "anchor_goal",
        "anchor_role",
        "selected_line",
        "selected_odds",
        "offers",
        "scope_compatible",
        "evidence_status",
    )
    missing = [field for field in required if field not in case]
    if missing:
        raise ValueError(f"Central-outcome case missing fields: {', '.join(missing)}")

    case_id = str(case["case_id"])
    if not case_id:
        raise ValueError("case_id cannot be empty")
    if not str(case["source_reference"]):
        raise ValueError(f"{case_id}: source_reference cannot be empty")

    family = str(case["structural_family"])
    if not family:
        raise ValueError(f"{case_id}: structural_family cannot be empty")
    if not str(case["structural_label"]):
        raise ValueError(f"{case_id}: structural_label cannot be empty")

    status = str(case["evidence_status"])
    if status not in KNOWN_STATUSES:
        raise ValueError(f"{case_id}: unknown evidence_status {status!r}")

    anchor_role = str(case["anchor_role"])
    if anchor_role not in KNOWN_ANCHOR_ROLES:
        raise ValueError(f"{case_id}: unknown anchor_role {anchor_role!r}")

    anchor_goal = int(case["anchor_goal"])
    if anchor_goal < 0:
        raise ValueError(f"{case_id}: anchor_goal cannot be negative")

    selected_line = float(case["selected_line"])
    selected_odds = float(case["selected_odds"])
    if not _is_quarter_line(selected_line):
        raise ValueError(f"{case_id}: selected_line must be a quarter-goal line")
    if selected_odds <= 1.0:
        raise ValueError(f"{case_id}: selected_odds must exceed 1.0")

    offers = case["offers"]
    if not isinstance(offers, Sequence) or isinstance(offers, (str, bytes)) or not offers:
        raise ValueError(f"{case_id}: offers must be a non-empty list")

    selected_found = False
    for offer in offers:
        if not isinstance(offer, Sequence) or isinstance(offer, (str, bytes)) or len(offer) != 2:
            raise ValueError(f"{case_id}: each offer must be [line, odds]")
        line = float(offer[0])
        odds = float(offer[1])
        if not _is_quarter_line(line):
            raise ValueError(f"{case_id}: offer line must be a quarter-goal line")
        if odds <= 1.0:
            raise ValueError(f"{case_id}: offer odds must exceed 1.0")
        selected_found |= line == selected_line and odds == selected_odds

    if not selected_found:
        raise ValueError(f"{case_id}: selected line/odds must exist in offers")

    return family, status


def _line_offset(case: Mapping[str, Any]) -> float:
    return round(float(case["selected_line"]) - int(case["anchor_goal"]), 2)


def _is_non_lowest_selection(case: Mapping[str, Any]) -> bool:
    selected = float(case["selected_line"])
    lowest = min(float(offer[0]) for offer in case["offers"])
    return selected > lowest


def _is_quarter_line(value: float) -> bool:
    return abs(value * 4 - round(value * 4)) < 0.000001
