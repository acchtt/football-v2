from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


CURRENT_SUPPORT = "current_support"
HISTORICAL_ONLY = "historical_only"
NEGATIVE_CONTROL = "negative_control"
KNOWN_STATUSES = frozenset({CURRENT_SUPPORT, HISTORICAL_ONLY, NEGATIVE_CONTROL})
UNRESOLVED = "UNRESOLVED"
CURRENT_TEMPLATE_CANDIDATE = "CURRENT_TEMPLATE_CANDIDATE"
RESEARCH_BLOCKER = "UPSTREAM_SCORE_SCENARIO_TEMPLATE_NOT_APPROVED"

Score = tuple[int, int]
PrimarySignature = tuple[Score, ...]
FullSignature = tuple[PrimarySignature, PrimarySignature]


@dataclass(frozen=True, slots=True)
class ScenarioEvidenceCase:
    case_id: str
    source_reference: str
    match: str
    model_version: str
    structural_archetype: str
    expected_total_range: tuple[int, int] | None
    anchor_goal: int | None
    primary_scores: PrimarySignature
    upside_scores: PrimarySignature
    evidence_status: str
    current_scope_compatible: bool
    audit_note: str

    @property
    def has_explicit_scores(self) -> bool:
        return bool(self.primary_scores)

    @property
    def primary_signature(self) -> PrimarySignature:
        return self.primary_scores

    @property
    def full_signature(self) -> FullSignature:
        return self.primary_scores, self.upside_scores


@dataclass(frozen=True, slots=True)
class ScenarioTemplateSummary:
    structural_archetype: str
    case_count: int
    current_support_count: int
    current_explicit_score_count: int
    current_band_only_count: int
    historical_explicit_score_count: int
    negative_explicit_score_count: int
    repeated_primary_signature: PrimarySignature | None
    repeated_primary_signature_count: int
    positive_historical_recurrence_count: int
    current_consistent_full_signature: FullSignature | None
    template_candidate_ready: bool


@dataclass(frozen=True, slots=True)
class ScenarioProducerRecoveryReport:
    case_count: int
    summaries: tuple[ScenarioTemplateSummary, ...]
    cases: tuple[ScenarioEvidenceCase, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class ScenarioProducerResult:
    structural_archetype: str
    status: str
    primary_scores: PrimarySignature
    upside_scores: PrimarySignature
    source_references: tuple[str, ...]
    reason: str
    template_candidate_ready: bool
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def analyze_scenario_producer_evidence(
    cases: Iterable[Mapping[str, Any]],
    *,
    minimum_current_support: int = 2,
) -> ScenarioProducerRecoveryReport:
    """Assess whether an explicit score-scenario template is recoverable per archetype.

    Historical/cross-version rows may reveal repeated forecast shapes but cannot create
    current authority. Negative controls are counted separately and can never increase
    template support. A production candidate requires repeated clean current-v0.2.47-R
    rows with the same *explicit* primary/upside score set.
    """
    normalized = tuple(_normalize_case(case) for case in cases)
    if not normalized:
        raise ValueError("At least one scenario-producer evidence case is required")

    by_archetype: dict[str, list[ScenarioEvidenceCase]] = defaultdict(list)
    for case in normalized:
        by_archetype[case.structural_archetype].append(case)

    summaries = tuple(
        _summarize_group(
            archetype,
            tuple(group),
            minimum_current_support=minimum_current_support,
        )
        for archetype, group in sorted(by_archetype.items())
    )
    return ScenarioProducerRecoveryReport(
        case_count=len(normalized),
        summaries=summaries,
        cases=normalized,
    )


def resolve_scenario_template(
    report: ScenarioProducerRecoveryReport,
    *,
    structural_archetype: str,
) -> ScenarioProducerResult:
    """Return a score template only when repeated current evidence actually supports it.

    This function deliberately has no grade argument. Grade alone is not a scoreline
    generator and historical templates are never silently promoted into current rules.
    """
    summary = next(
        (
            item
            for item in report.summaries
            if item.structural_archetype == structural_archetype
        ),
        None,
    )
    if summary is None:
        return ScenarioProducerResult(
            structural_archetype=structural_archetype,
            status=UNRESOLVED,
            primary_scores=(),
            upside_scores=(),
            source_references=(),
            reason="No recovered evidence exists for this structural archetype.",
            template_candidate_ready=False,
        )

    if not summary.template_candidate_ready or summary.current_consistent_full_signature is None:
        reasons: list[str] = []
        if summary.current_explicit_score_count == 0 and summary.current_support_count:
            reasons.append(
                "current v0.2.47-R evidence preserves band/anchor information but no explicit score set"
            )
        elif summary.current_explicit_score_count:
            reasons.append("current explicit score evidence is insufficient or inconsistent")
        else:
            reasons.append("only historical/negative explicit score evidence is available")
        if summary.repeated_primary_signature_count >= 2:
            reasons.append(
                "a historical primary-score recurrence exists but cross-version/negative evidence cannot activate it"
            )
        return ScenarioProducerResult(
            structural_archetype=structural_archetype,
            status=UNRESOLVED,
            primary_scores=(),
            upside_scores=(),
            source_references=(),
            reason="; ".join(reasons) + ".",
            template_candidate_ready=False,
        )

    primary, upside = summary.current_consistent_full_signature
    current_refs = tuple(
        case.source_reference
        for case in report.cases
        if case.structural_archetype == structural_archetype
        and case.evidence_status == CURRENT_SUPPORT
        and case.current_scope_compatible
        and case.full_signature == summary.current_consistent_full_signature
    )
    return ScenarioProducerResult(
        structural_archetype=structural_archetype,
        status=CURRENT_TEMPLATE_CANDIDATE,
        primary_scores=primary,
        upside_scores=upside,
        source_references=current_refs,
        reason=(
            "Repeated clean current evidence supports one explicit score-scenario template. "
            "It remains research-only until separately approved in canonical state."
        ),
        template_candidate_ready=True,
    )


def _summarize_group(
    archetype: str,
    cases: Sequence[ScenarioEvidenceCase],
    *,
    minimum_current_support: int,
) -> ScenarioTemplateSummary:
    current = tuple(
        case
        for case in cases
        if case.evidence_status == CURRENT_SUPPORT and case.current_scope_compatible
    )
    current_explicit = tuple(case for case in current if case.has_explicit_scores)
    historical_explicit = tuple(
        case
        for case in cases
        if case.evidence_status == HISTORICAL_ONLY and case.has_explicit_scores
    )
    negative_explicit = tuple(
        case
        for case in cases
        if case.evidence_status == NEGATIVE_CONTROL and case.has_explicit_scores
    )

    all_explicit = historical_explicit + negative_explicit + current_explicit
    primary_counts = Counter(case.primary_signature for case in all_explicit)
    repeated_primary: PrimarySignature | None = None
    repeated_count = 0
    if primary_counts:
        repeated_primary, repeated_count = max(
            primary_counts.items(),
            key=lambda item: (item[1], item[0]),
        )
        if repeated_count < 2:
            repeated_primary = None
            repeated_count = 0

    positive_historical_count = 0
    if repeated_primary is not None:
        positive_historical_count = sum(
            case.primary_signature == repeated_primary for case in historical_explicit
        )

    current_full_counts = Counter(case.full_signature for case in current_explicit)
    current_consistent: FullSignature | None = None
    template_ready = False
    if current_full_counts and len(current_full_counts) == 1:
        current_consistent, count = next(iter(current_full_counts.items()))
        template_ready = count >= minimum_current_support

    return ScenarioTemplateSummary(
        structural_archetype=archetype,
        case_count=len(cases),
        current_support_count=len(current),
        current_explicit_score_count=len(current_explicit),
        current_band_only_count=sum(not case.has_explicit_scores for case in current),
        historical_explicit_score_count=len(historical_explicit),
        negative_explicit_score_count=len(negative_explicit),
        repeated_primary_signature=repeated_primary,
        repeated_primary_signature_count=repeated_count,
        positive_historical_recurrence_count=positive_historical_count,
        current_consistent_full_signature=current_consistent,
        template_candidate_ready=template_ready,
    )


def _normalize_case(raw: Mapping[str, Any]) -> ScenarioEvidenceCase:
    required = (
        "case_id",
        "source_reference",
        "match",
        "model_version",
        "structural_archetype",
        "primary_scores",
        "upside_scores",
        "evidence_status",
        "current_scope_compatible",
        "audit_note",
    )
    missing = [field for field in required if field not in raw]
    if missing:
        raise ValueError(f"Scenario evidence missing fields: {', '.join(missing)}")

    status = str(raw["evidence_status"])
    if status not in KNOWN_STATUSES:
        raise ValueError(f"Unknown scenario evidence status: {status!r}")

    primary = _parse_scores(raw["primary_scores"])
    upside = _parse_scores(raw["upside_scores"])
    if upside and not primary:
        raise ValueError("Upside score scenarios require at least one primary score scenario")

    expected = raw.get("expected_total_range")
    expected_range: tuple[int, int] | None = None
    if expected is not None:
        if not isinstance(expected, Sequence) or isinstance(expected, (str, bytes)) or len(expected) != 2:
            raise ValueError("expected_total_range must be [low, high] or null")
        low, high = int(expected[0]), int(expected[1])
        if low < 0 or high < low:
            raise ValueError("Invalid expected_total_range")
        expected_range = (low, high)

    anchor = raw.get("anchor_goal")
    anchor_goal = None if anchor is None else int(anchor)
    if anchor_goal is not None and anchor_goal < 0:
        raise ValueError("anchor_goal cannot be negative")

    return ScenarioEvidenceCase(
        case_id=str(raw["case_id"]),
        source_reference=str(raw["source_reference"]),
        match=str(raw["match"]),
        model_version=str(raw["model_version"]),
        structural_archetype=str(raw["structural_archetype"]),
        expected_total_range=expected_range,
        anchor_goal=anchor_goal,
        primary_scores=primary,
        upside_scores=upside,
        evidence_status=status,
        current_scope_compatible=bool(raw["current_scope_compatible"]),
        audit_note=str(raw["audit_note"]),
    )


def _parse_scores(raw_scores: Any) -> PrimarySignature:
    if not isinstance(raw_scores, Sequence) or isinstance(raw_scores, (str, bytes)):
        raise ValueError("score scenarios must be an array")
    parsed: list[Score] = []
    for score in raw_scores:
        if not isinstance(score, Sequence) or isinstance(score, (str, bytes)) or len(score) != 2:
            raise ValueError("Each score scenario must contain [home_goals, away_goals]")
        home, away = int(score[0]), int(score[1])
        if home < 0 or away < 0:
            raise ValueError("Score-scenario goals cannot be negative")
        parsed.append((home, away))
    return tuple(parsed)
