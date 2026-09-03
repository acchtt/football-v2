from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


SUPPORTING_STATUS = "supporting_reconstruction"
NEGATIVE_STATUSES = frozenset({"audited_projection_miss", "failed_forecast"})
KNOWN_STATUSES = frozenset(
    {
        SUPPORTING_STATUS,
        "historical_forecast_only",
        *NEGATIVE_STATUSES,
    }
)
RESEARCH_BLOCKER = "RESEARCH_ONLY_CANONICAL_TEMPLATE_MAPPING_NOT_APPROVED"


@dataclass(frozen=True, slots=True)
class GoalBand:
    minimum: int
    maximum: int


@dataclass(frozen=True, slots=True)
class TemplateGroupSummary:
    structural_archetype: str
    historical_sample_count: int
    supporting_sample_count: int
    negative_control_count: int
    historical_observed_bands: tuple[GoalBand, ...]
    supporting_observed_bands: tuple[GoalBand, ...]
    historical_mapping_consistent: bool
    supporting_mapping_status: str
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class TemplateRecoveryReport:
    case_count: int
    supporting_case_count: int
    negative_control_count: int
    groups: tuple[TemplateGroupSummary, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def analyze_template_cases(
    cases: Iterable[Mapping[str, Any]],
) -> TemplateRecoveryReport:
    """Summarize recovered structure-to-goal-band mappings without predicting.

    Historical forecasts are useful for reconstructing what an older model emitted,
    even when later audits found the forecast or classification weak. Only rows marked
    ``supporting_reconstruction`` are allowed to count as positive validation evidence.
    The analyzer reports ambiguity and sparsity; it never chooses a production band.
    """
    case_list = tuple(cases)
    if not case_list:
        raise ValueError("At least one projection-template case is required")

    by_archetype: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    supporting_case_count = 0
    negative_control_count = 0

    for case in case_list:
        archetype, status, _ = _validate_case(case)
        by_archetype[archetype].append(case)
        supporting_case_count += status == SUPPORTING_STATUS
        negative_control_count += status in NEGATIVE_STATUSES

    groups = tuple(
        _summarize_group(archetype, group_cases)
        for archetype, group_cases in sorted(by_archetype.items())
    )
    return TemplateRecoveryReport(
        case_count=len(case_list),
        supporting_case_count=supporting_case_count,
        negative_control_count=negative_control_count,
        groups=groups,
    )


def sufficiently_supported_consistent_groups(
    report: TemplateRecoveryReport,
    *,
    minimum_supporting_cases: int = 2,
) -> tuple[TemplateGroupSummary, ...]:
    """Return research groups with repeated, non-contradictory support.

    The result is still not an approved mapping. This helper exists only to show which
    archetypes have enough repeated evidence to justify a future model-change proposal.
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
    archetype: str,
    cases: Sequence[Mapping[str, Any]],
) -> TemplateGroupSummary:
    historical_bands = tuple(sorted({_goal_band(case) for case in cases}, key=_band_sort_key))
    supporting_cases = tuple(case for case in cases if case["evidence_status"] == SUPPORTING_STATUS)
    supporting_bands = tuple(
        sorted({_goal_band(case) for case in supporting_cases}, key=_band_sort_key)
    )
    negative_count = sum(case["evidence_status"] in NEGATIVE_STATUSES for case in cases)

    if not supporting_cases:
        supporting_status = "NO_SUPPORTING_EVIDENCE"
    elif len(supporting_cases) == 1:
        supporting_status = "SPARSE"
    elif len(supporting_bands) == 1:
        supporting_status = "CONSISTENT"
    else:
        supporting_status = "CONTRADICTORY"

    return TemplateGroupSummary(
        structural_archetype=archetype,
        historical_sample_count=len(cases),
        supporting_sample_count=len(supporting_cases),
        negative_control_count=negative_count,
        historical_observed_bands=historical_bands,
        supporting_observed_bands=supporting_bands,
        historical_mapping_consistent=len(historical_bands) == 1,
        supporting_mapping_status=supporting_status,
    )


def _validate_case(case: Mapping[str, Any]) -> tuple[str, str, GoalBand]:
    required = (
        "case_id",
        "source_record_id",
        "structural_archetype",
        "carrier_level",
        "secondary_route",
        "two_sided_strength",
        "failure_modes",
        "expected_total_range",
        "evidence_status",
    )
    missing = [field for field in required if field not in case]
    if missing:
        raise ValueError(f"Projection-template case missing fields: {', '.join(missing)}")

    case_id = str(case["case_id"])
    if not case_id:
        raise ValueError("case_id cannot be empty")
    if not str(case["source_record_id"]):
        raise ValueError(f"{case_id}: source_record_id cannot be empty")

    archetype = str(case["structural_archetype"])
    if not archetype:
        raise ValueError(f"{case_id}: structural_archetype cannot be empty")

    status = str(case["evidence_status"])
    if status not in KNOWN_STATUSES:
        raise ValueError(f"{case_id}: unknown evidence_status {status!r}")

    failure_modes = case["failure_modes"]
    if not isinstance(failure_modes, Sequence) or isinstance(failure_modes, (str, bytes)):
        raise ValueError(f"{case_id}: failure_modes must be a list")

    return archetype, status, _goal_band(case)


def _goal_band(case: Mapping[str, Any]) -> GoalBand:
    case_id = str(case.get("case_id", "unknown"))
    raw_range = case.get("expected_total_range")
    if not isinstance(raw_range, Sequence) or isinstance(raw_range, (str, bytes)):
        raise ValueError(f"{case_id}: expected_total_range must contain [min, max]")
    if len(raw_range) != 2:
        raise ValueError(f"{case_id}: expected_total_range must contain [min, max]")

    minimum = int(raw_range[0])
    maximum = int(raw_range[1])
    if minimum < 0 or maximum < minimum:
        raise ValueError(f"{case_id}: invalid expected_total_range")
    return GoalBand(minimum=minimum, maximum=maximum)


def _band_sort_key(band: GoalBand) -> tuple[int, int]:
    return band.minimum, band.maximum
