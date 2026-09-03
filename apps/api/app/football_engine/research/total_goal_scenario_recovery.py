from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence

from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer
from app.football_engine.versions.v0_2_47_R.market_math import (
    MarketOfferEvaluation,
    even_money_fair_total,
    projected_mean_goals,
    rank_over_offers,
)
from app.football_engine.versions.v0_2_47_R.scenario_distribution import (
    build_total_goal_scenario_distribution,
)


CURRENT_SUPPORT = "current_support"
HISTORICAL_ONLY = "historical_only"
NEGATIVE_CONTROL = "negative_control"
ACCEPTANCE_CONTROL = "acceptance_control"
KNOWN_STATUSES = frozenset(
    {CURRENT_SUPPORT, HISTORICAL_ONLY, NEGATIVE_CONTROL, ACCEPTANCE_CONTROL}
)

BAND_EQUAL_PRIMARY = "BAND_EQUAL_PRIMARY"
LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE = "LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE"
KNOWN_POLICIES = frozenset(
    {BAND_EQUAL_PRIMARY, LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE}
)

UNRESOLVED = "UNRESOLVED"
RESEARCH_BLOCKER = "BAND_TO_TOTAL_GOAL_SCENARIOS_NOT_APPROVED"

Score = tuple[int, int]


@dataclass(frozen=True, slots=True)
class TotalGoalRecoveryCase:
    case_id: str
    source_reference: str
    match: str
    model_version: str
    expected_total_range: tuple[int, int] | None
    anchor_goal: int | None
    primary_scores: tuple[Score, ...]
    upside_scores: tuple[Score, ...]
    evidence_status: str
    current_scope_compatible: bool
    offers: tuple[tuple[Decimal, Decimal], ...]
    selected_line: Decimal | None
    selected_odds: Decimal | None
    audit_note: str

    @property
    def has_band_and_anchor(self) -> bool:
        return self.expected_total_range is not None and self.anchor_goal is not None

    @property
    def has_explicit_scenarios(self) -> bool:
        return bool(self.primary_scores)

    @property
    def collapsed_primary_totals(self) -> tuple[int, ...]:
        return tuple(home + away for home, away in self.primary_scores)

    @property
    def collapsed_upside_totals(self) -> tuple[int, ...]:
        return tuple(home + away for home, away in self.upside_scores)


@dataclass(frozen=True, slots=True)
class TotalGoalScenarioCandidate:
    policy: str
    expected_total_range: tuple[int, int]
    anchor_goal: int
    primary_totals: tuple[int, ...]
    upside_totals: tuple[int, ...]
    distribution: dict[int, Decimal]
    projected_mean_goals: Decimal
    even_money_fair_total: Decimal
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class TotalGoalScenarioRecoveryReport:
    case_count: int
    current_support_count: int
    current_band_anchor_count: int
    current_explicit_scenario_count: int
    historical_explicit_scenario_count: int
    negative_control_count: int
    acceptance_control_count: int
    current_band_anchor_sources: tuple[str, ...]
    mapping_status: str
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


@dataclass(frozen=True, slots=True)
class MarketCompatibilityReport:
    minimum_price: Decimal
    eligible_offer_count: int
    ranked_evaluations: tuple[MarketOfferEvaluation, ...]
    production_ready: bool = False
    blocker: str = RESEARCH_BLOCKER


def analyze_total_goal_scenario_cases(
    cases: Iterable[Mapping[str, Any]],
) -> TotalGoalScenarioRecoveryReport:
    """Measure how much evidence exists for band/anchor -> total-scenario production.

    A goal band and central anchor do not identify scenario multiplicity by themselves.
    Example: a 3-4 band with central three is compatible with both equal primary mass
    on [3, 4] and a primary-three/upside-four interpretation. This analyzer therefore
    counts evidence but never chooses a policy from band/anchor text alone.
    """
    normalized = tuple(_normalize_case(case) for case in cases)
    if not normalized:
        raise ValueError("At least one total-goal recovery case is required")

    current = tuple(
        case
        for case in normalized
        if case.evidence_status == CURRENT_SUPPORT and case.current_scope_compatible
    )
    current_band_anchor = tuple(case for case in current if case.has_band_and_anchor)
    current_explicit = tuple(case for case in current if case.has_explicit_scenarios)
    historical_explicit = tuple(
        case
        for case in normalized
        if case.evidence_status == HISTORICAL_ONLY and case.has_explicit_scenarios
    )

    if not current_band_anchor:
        mapping_status = "NO_CURRENT_BAND_ANCHOR_EVIDENCE"
    elif not current_explicit:
        mapping_status = "NON_IDENTIFIABLE_FROM_BAND_ANCHOR_ONLY"
    elif len(current_explicit) == 1:
        mapping_status = "SPARSE_CURRENT_EXPLICIT_MAPPING"
    else:
        mapping_status = "CURRENT_EXPLICIT_MAPPING_REQUIRES_POLICY_COMPARISON"

    return TotalGoalScenarioRecoveryReport(
        case_count=len(normalized),
        current_support_count=len(current),
        current_band_anchor_count=len(current_band_anchor),
        current_explicit_scenario_count=len(current_explicit),
        historical_explicit_scenario_count=len(historical_explicit),
        negative_control_count=sum(
            case.evidence_status == NEGATIVE_CONTROL for case in normalized
        ),
        acceptance_control_count=sum(
            case.evidence_status == ACCEPTANCE_CONTROL for case in normalized
        ),
        current_band_anchor_sources=tuple(
            case.source_reference for case in current_band_anchor
        ),
        mapping_status=mapping_status,
    )


def build_band_anchor_candidate(
    expected_total_range: Sequence[int],
    anchor_goal: int,
    *,
    policy: str,
) -> TotalGoalScenarioCandidate:
    """Benchmark one explicit research interpretation of a recovered band + anchor.

    The function requires the caller to name the policy. There is intentionally no
    default because the historical ledger has not identified a canonical mapping.
    """
    if policy not in KNOWN_POLICIES:
        raise ValueError(f"Unknown total-goal scenario policy: {policy!r}")
    low, high = _parse_range(expected_total_range)
    anchor = int(anchor_goal)
    if anchor < low or anchor > high:
        raise ValueError("anchor_goal must lie inside expected_total_range")

    if policy == BAND_EQUAL_PRIMARY:
        primary = tuple(range(low, high + 1))
        upside: tuple[int, ...] = ()
    else:
        if anchor != low:
            raise ValueError(
                "LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE requires anchor at lower band bound"
            )
        primary = (anchor,)
        upside = tuple(range(anchor + 1, high + 1))
        if not upside:
            raise ValueError("Anchor/upside policy requires at least one higher band outcome")

    scenario_result = build_total_goal_scenario_distribution(
        primary,
        upside_totals=upside,
    )
    fair_total = even_money_fair_total(scenario_result.distribution)
    return TotalGoalScenarioCandidate(
        policy=policy,
        expected_total_range=(low, high),
        anchor_goal=anchor,
        primary_totals=primary,
        upside_totals=upside,
        distribution=scenario_result.distribution,
        projected_mean_goals=projected_mean_goals(scenario_result.distribution),
        even_money_fair_total=fair_total.line,
    )


def collapse_explicit_scores_to_total_scenarios(
    primary_scores: Sequence[Sequence[int]],
    *,
    upside_scores: Sequence[Sequence[int]] = (),
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """Remove team identity while preserving every scenario and its Method C label."""
    primary = tuple(sum(_parse_score(score)) for score in primary_scores)
    if not primary:
        raise ValueError("At least one primary score scenario is required")
    upside = tuple(sum(_parse_score(score)) for score in upside_scores)
    return primary, upside


def evaluate_candidate_market_compatibility(
    candidate: TotalGoalScenarioCandidate,
    offers: Iterable[Sequence[Decimal | float | str]],
    *,
    minimum_price: Decimal | float | str,
) -> MarketCompatibilityReport:
    """Run exact market math as a compatibility diagnostic, never as a verdict rule."""
    minimum = Decimal(str(minimum_price))
    eligible = tuple(
        OddsOffer(line=float(line), over_odds=float(odds), under_odds=0.0)
        for line, odds in offers
        if Decimal(str(odds)) >= minimum
    )
    if not eligible:
        raise ValueError("No offers satisfy the minimum price floor")
    ranked = rank_over_offers(candidate.distribution, eligible)
    return MarketCompatibilityReport(
        minimum_price=minimum,
        eligible_offer_count=len(eligible),
        ranked_evaluations=ranked,
    )


def _normalize_case(raw: Mapping[str, Any]) -> TotalGoalRecoveryCase:
    required = (
        "case_id",
        "source_reference",
        "match",
        "model_version",
        "expected_total_range",
        "anchor_goal",
        "primary_scores",
        "upside_scores",
        "evidence_status",
        "current_scope_compatible",
        "offers",
        "selected_line",
        "selected_odds",
        "audit_note",
    )
    missing = [field for field in required if field not in raw]
    if missing:
        raise ValueError(f"Total-goal recovery case missing fields: {', '.join(missing)}")

    status = str(raw["evidence_status"])
    if status not in KNOWN_STATUSES:
        raise ValueError(f"Unknown evidence_status: {status!r}")

    expected_raw = raw["expected_total_range"]
    expected = None if expected_raw is None else _parse_range(expected_raw)
    anchor_raw = raw["anchor_goal"]
    anchor = None if anchor_raw is None else int(anchor_raw)
    if anchor is not None and anchor < 0:
        raise ValueError("anchor_goal cannot be negative")
    if expected is not None and anchor is not None and not (expected[0] <= anchor <= expected[1]):
        raise ValueError("anchor_goal must lie inside expected_total_range")

    primary = tuple(_parse_score(score) for score in raw["primary_scores"])
    upside = tuple(_parse_score(score) for score in raw["upside_scores"])
    if upside and not primary:
        raise ValueError("Upside scores require primary scores")

    offers_raw = raw["offers"]
    offers: list[tuple[Decimal, Decimal]] = []
    for offer in offers_raw:
        if not isinstance(offer, Sequence) or isinstance(offer, (str, bytes)) or len(offer) != 2:
            raise ValueError("Each offer must contain [line, odds]")
        line, odds = Decimal(str(offer[0])), Decimal(str(offer[1]))
        if odds <= 1:
            raise ValueError("Offer odds must exceed 1.00")
        offers.append((line, odds))

    selected_line_raw = raw["selected_line"]
    selected_odds_raw = raw["selected_odds"]
    selected_line = None if selected_line_raw is None else Decimal(str(selected_line_raw))
    selected_odds = None if selected_odds_raw is None else Decimal(str(selected_odds_raw))
    if (selected_line is None) != (selected_odds is None):
        raise ValueError("selected_line and selected_odds must both be present or both be null")
    if selected_odds is not None and selected_odds <= 1:
        raise ValueError("selected_odds must exceed 1.00")

    return TotalGoalRecoveryCase(
        case_id=str(raw["case_id"]),
        source_reference=str(raw["source_reference"]),
        match=str(raw["match"]),
        model_version=str(raw["model_version"]),
        expected_total_range=expected,
        anchor_goal=anchor,
        primary_scores=primary,
        upside_scores=upside,
        evidence_status=status,
        current_scope_compatible=bool(raw["current_scope_compatible"]),
        offers=tuple(offers),
        selected_line=selected_line,
        selected_odds=selected_odds,
        audit_note=str(raw["audit_note"]),
    )


def _parse_range(raw: Sequence[int]) -> tuple[int, int]:
    if isinstance(raw, (str, bytes)) or len(raw) != 2:
        raise ValueError("expected_total_range must contain [low, high]")
    low, high = int(raw[0]), int(raw[1])
    if low < 0 or high < low:
        raise ValueError("Invalid expected_total_range")
    return low, high


def _parse_score(raw: Sequence[int]) -> Score:
    if isinstance(raw, (str, bytes)) or len(raw) != 2:
        raise ValueError("Score scenario must contain [home_goals, away_goals]")
    home, away = int(raw[0]), int(raw[1])
    if home < 0 or away < 0:
        raise ValueError("Score-scenario goals cannot be negative")
    return home, away
