from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence

from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer
from app.football_engine.versions.v0_2_47_R.market_math import rank_over_offers
from app.football_engine.versions.v0_2_47_R.settlement import settle_over

from .total_goal_scenario_recovery import (
    BAND_EQUAL_PRIMARY,
    LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    KNOWN_POLICIES,
    build_band_anchor_candidate,
)


CLEAN_SUPPORT = "clean_support"
CAUTION = "caution"
AUDITED_ERROR = "audited_error"
HISTORICAL_ONLY = "historical_only"
ACCEPTANCE_HOLDOUT = "acceptance_holdout"
KNOWN_TIERS = frozenset(
    {CLEAN_SUPPORT, CAUTION, AUDITED_ERROR, HISTORICAL_ONLY, ACCEPTANCE_HOLDOUT}
)

AUDIT_NONE = "none"
AUDIT_UPSTREAM_STRUCTURE = "upstream_structure"
AUDIT_GOAL_BURDEN = "goal_burden"
AUDIT_OUTCOME_LUCKY = "outcome_lucky"
AUDIT_SCOPE_ONLY = "scope_only"
AUDIT_ACCEPTANCE = "acceptance"
KNOWN_AUDIT_CLASSES = frozenset(
    {
        AUDIT_NONE,
        AUDIT_UPSTREAM_STRUCTURE,
        AUDIT_GOAL_BURDEN,
        AUDIT_OUTCOME_LUCKY,
        AUDIT_SCOPE_ONLY,
        AUDIT_ACCEPTANCE,
    }
)

EXPLICIT_BAND = "explicit_recovered_band"
SHADOW_GENERIC_BAND = "shadow_generic_anchor_band"
KNOWN_BAND_BASES = frozenset({EXPLICIT_BAND, SHADOW_GENERIC_BAND})

BENCHMARK_STATUS = "DESCRIPTIVE_ONLY_NO_PRODUCTION_WINNER"
BENCHMARK_BLOCKER = "TOTAL_GOAL_SCENARIO_PRODUCER_PENDING"


@dataclass(frozen=True, slots=True)
class ShadowBenchmarkCase:
    case_id: str
    match: str
    source_reference: str
    evidence_tier: str
    audit_class: str
    anchor_goal: int
    assumed_total_range: tuple[int, int]
    band_basis: str
    offers: tuple[tuple[Decimal, Decimal], ...]
    selected_line: Decimal
    selected_odds: Decimal
    note: str


@dataclass(frozen=True, slots=True)
class ShadowCaseEvaluation:
    case_id: str
    match: str
    evidence_tier: str
    audit_class: str
    policy: str
    anchor_goal: int
    fair_total: Decimal
    projected_mean_goals: Decimal
    selected_line: Decimal
    selected_odds: Decimal
    selected_settlement_at_anchor: str
    selected_expected_pnl: Decimal
    selected_ev_rank: int
    top_ev_line: Decimal
    top_ev_odds: Decimal
    top_ev_expected_pnl: Decimal
    ev_gap_to_top: Decimal
    exact_rank_match: bool
    eligible_offer_count: int


@dataclass(frozen=True, slots=True)
class CandidateShadowSummary:
    policy: str
    assumed_total_range: tuple[int, int]
    anchor_goal: int
    fair_total: Decimal
    projected_mean_goals: Decimal
    clean_support_count: int
    clean_exact_rank_match_count: int
    clean_positive_selected_ev_count: int
    clean_mean_ev_gap_to_top: Decimal
    caution_count: int
    caution_negative_selected_ev_count: int
    audited_goal_burden_error_count: int
    audited_goal_burden_negative_ev_count: int
    acceptance_holdout_count: int
    acceptance_exact_rank_match_count: int
    acceptance_positive_selected_ev_count: int
    probability_below_band: Decimal
    probability_above_band: Decimal
    production_ready: bool = False
    blocker: str = BENCHMARK_BLOCKER


@dataclass(frozen=True, slots=True)
class DistributionShadowBenchmarkReport:
    case_count: int
    assumed_total_range: tuple[int, int]
    anchor_goal: int
    minimum_price: Decimal
    maximum_price: Decimal
    comparison_status: str
    summaries: tuple[CandidateShadowSummary, ...]
    evaluations: tuple[ShadowCaseEvaluation, ...]
    production_ready: bool = False
    blocker: str = BENCHMARK_BLOCKER


def run_distribution_shadow_benchmark(
    cases: Iterable[Mapping[str, Any]],
    *,
    policies: Sequence[str] = (
        BAND_EQUAL_PRIMARY,
        LOWER_ANCHOR_PRIMARY_UPPER_BAND_UPSIDE,
    ),
    minimum_price: Decimal | float | str = Decimal("1.70"),
    maximum_price: Decimal | float | str = Decimal("2.30"),
) -> DistributionShadowBenchmarkReport:
    """Compare candidate band->distribution mappings without fitting a production rule.

    Every benchmark row supplies an explicit historical market board and chosen line.
    Rows with ``band_basis=shadow_generic_anchor_band`` deliberately test the candidate
    under a common assumed band; they are not evidence that the historical record itself
    preserved that band. Acceptance rows are evaluated but excluded from fitting-style
    clean-support summaries.

    Exact-EV rank is diagnostic only. Historical v0.2.47-R line expression also used
    settlement protection, structure, failure modes and price tradeoffs, so a mechanical
    EV mismatch is not by itself a model failure.
    """
    normalized = tuple(_normalize_case(case) for case in cases)
    if not normalized:
        raise ValueError("At least one shadow benchmark case is required")

    band_anchor_pairs = {
        (case.assumed_total_range, case.anchor_goal) for case in normalized
    }
    if len(band_anchor_pairs) != 1:
        raise ValueError(
            "One shadow benchmark run must use one common assumed band and anchor"
        )
    assumed_total_range, anchor_goal = next(iter(band_anchor_pairs))

    minimum = Decimal(str(minimum_price))
    maximum = Decimal(str(maximum_price))
    if minimum <= Decimal("1") or maximum < minimum:
        raise ValueError("Invalid benchmark price range")

    unknown_policies = [policy for policy in policies if policy not in KNOWN_POLICIES]
    if unknown_policies:
        raise ValueError(f"Unknown benchmark policies: {', '.join(unknown_policies)}")
    if not policies:
        raise ValueError("At least one benchmark policy is required")

    evaluations: list[ShadowCaseEvaluation] = []
    summaries: list[CandidateShadowSummary] = []

    for policy in policies:
        policy_evaluations = tuple(
            _evaluate_case(
                case,
                policy=policy,
                minimum_price=minimum,
                maximum_price=maximum,
            )
            for case in normalized
        )
        evaluations.extend(policy_evaluations)
        summaries.append(
            _summarize_policy(
                policy,
                policy_evaluations,
                assumed_total_range=assumed_total_range,
                anchor_goal=anchor_goal,
            )
        )

    return DistributionShadowBenchmarkReport(
        case_count=len(normalized),
        assumed_total_range=assumed_total_range,
        anchor_goal=anchor_goal,
        minimum_price=minimum,
        maximum_price=maximum,
        comparison_status=BENCHMARK_STATUS,
        summaries=tuple(summaries),
        evaluations=tuple(evaluations),
    )


def _evaluate_case(
    case: ShadowBenchmarkCase,
    *,
    policy: str,
    minimum_price: Decimal,
    maximum_price: Decimal,
) -> ShadowCaseEvaluation:
    candidate = build_band_anchor_candidate(
        case.assumed_total_range,
        case.anchor_goal,
        policy=policy,
    )
    eligible = tuple(
        OddsOffer(line=float(line), over_odds=float(odds), under_odds=0.0)
        for line, odds in case.offers
        if minimum_price <= odds <= maximum_price
    )
    if not eligible:
        raise ValueError(f"{case.case_id}: no offers inside benchmark price range")

    ranked = rank_over_offers(candidate.distribution, eligible)
    selected = next(
        (
            item
            for item in ranked
            if item.line == case.selected_line and item.offered_odds == case.selected_odds
        ),
        None,
    )
    if selected is None:
        raise ValueError(
            f"{case.case_id}: historical selected offer is outside the benchmark price range"
        )

    selected_rank = next(
        index for index, item in enumerate(ranked, start=1) if item == selected
    )
    top = ranked[0]
    return ShadowCaseEvaluation(
        case_id=case.case_id,
        match=case.match,
        evidence_tier=case.evidence_tier,
        audit_class=case.audit_class,
        policy=policy,
        anchor_goal=case.anchor_goal,
        fair_total=candidate.even_money_fair_total,
        projected_mean_goals=candidate.projected_mean_goals,
        selected_line=selected.line,
        selected_odds=selected.offered_odds,
        selected_settlement_at_anchor=settle_over(
            case.anchor_goal,
            selected.line,
        ).value,
        selected_expected_pnl=selected.expected_pnl_units,
        selected_ev_rank=selected_rank,
        top_ev_line=top.line,
        top_ev_odds=top.offered_odds,
        top_ev_expected_pnl=top.expected_pnl_units,
        ev_gap_to_top=top.expected_pnl_units - selected.expected_pnl_units,
        exact_rank_match=(
            top.line == selected.line and top.offered_odds == selected.offered_odds
        ),
        eligible_offer_count=len(ranked),
    )


def _summarize_policy(
    policy: str,
    evaluations: Sequence[ShadowCaseEvaluation],
    *,
    assumed_total_range: tuple[int, int],
    anchor_goal: int,
) -> CandidateShadowSummary:
    clean = tuple(item for item in evaluations if item.evidence_tier == CLEAN_SUPPORT)
    caution = tuple(item for item in evaluations if item.evidence_tier == CAUTION)
    burden_errors = tuple(
        item
        for item in evaluations
        if item.evidence_tier == AUDITED_ERROR and item.audit_class == AUDIT_GOAL_BURDEN
    )
    holdout = tuple(
        item for item in evaluations if item.evidence_tier == ACCEPTANCE_HOLDOUT
    )
    if not clean:
        raise ValueError("Shadow benchmark requires at least one clean-support case")

    candidate = build_band_anchor_candidate(
        assumed_total_range,
        anchor_goal,
        policy=policy,
    )
    low, high = assumed_total_range

    return CandidateShadowSummary(
        policy=policy,
        assumed_total_range=assumed_total_range,
        anchor_goal=anchor_goal,
        fair_total=candidate.even_money_fair_total,
        projected_mean_goals=candidate.projected_mean_goals,
        clean_support_count=len(clean),
        clean_exact_rank_match_count=sum(item.exact_rank_match for item in clean),
        clean_positive_selected_ev_count=sum(
            item.selected_expected_pnl > 0 for item in clean
        ),
        clean_mean_ev_gap_to_top=(
            sum((item.ev_gap_to_top for item in clean), Decimal("0"))
            / Decimal(len(clean))
        ),
        caution_count=len(caution),
        caution_negative_selected_ev_count=sum(
            item.selected_expected_pnl < 0 for item in caution
        ),
        audited_goal_burden_error_count=len(burden_errors),
        audited_goal_burden_negative_ev_count=sum(
            item.selected_expected_pnl < 0 for item in burden_errors
        ),
        acceptance_holdout_count=len(holdout),
        acceptance_exact_rank_match_count=sum(item.exact_rank_match for item in holdout),
        acceptance_positive_selected_ev_count=sum(
            item.selected_expected_pnl > 0 for item in holdout
        ),
        probability_below_band=sum(
            (probability for total, probability in candidate.distribution.items() if total < low),
            Decimal("0"),
        ),
        probability_above_band=sum(
            (probability for total, probability in candidate.distribution.items() if total > high),
            Decimal("0"),
        ),
    )


def _normalize_case(raw: Mapping[str, Any]) -> ShadowBenchmarkCase:
    required = (
        "case_id",
        "match",
        "source_reference",
        "evidence_tier",
        "audit_class",
        "anchor_goal",
        "assumed_total_range",
        "band_basis",
        "offers",
        "selected_line",
        "selected_odds",
        "note",
    )
    missing = [field for field in required if field not in raw]
    if missing:
        raise ValueError(f"Shadow benchmark case missing fields: {', '.join(missing)}")

    case_id = str(raw["case_id"])
    tier = str(raw["evidence_tier"])
    audit_class = str(raw["audit_class"])
    band_basis = str(raw["band_basis"])
    if tier not in KNOWN_TIERS:
        raise ValueError(f"{case_id}: unknown evidence_tier {tier!r}")
    if audit_class not in KNOWN_AUDIT_CLASSES:
        raise ValueError(f"{case_id}: unknown audit_class {audit_class!r}")
    if band_basis not in KNOWN_BAND_BASES:
        raise ValueError(f"{case_id}: unknown band_basis {band_basis!r}")

    assumed_range = raw["assumed_total_range"]
    if (
        not isinstance(assumed_range, Sequence)
        or isinstance(assumed_range, (str, bytes))
        or len(assumed_range) != 2
    ):
        raise ValueError(f"{case_id}: assumed_total_range must be [low, high]")
    low, high = int(assumed_range[0]), int(assumed_range[1])
    anchor = int(raw["anchor_goal"])
    if low < 0 or high < low or not (low <= anchor <= high):
        raise ValueError(f"{case_id}: invalid assumed band/anchor")

    offers: list[tuple[Decimal, Decimal]] = []
    for offer in raw["offers"]:
        if not isinstance(offer, Sequence) or isinstance(offer, (str, bytes)) or len(offer) != 2:
            raise ValueError(f"{case_id}: each offer must be [line, odds]")
        line, odds = Decimal(str(offer[0])), Decimal(str(offer[1]))
        if odds <= 1:
            raise ValueError(f"{case_id}: offer odds must exceed 1.00")
        offers.append((line, odds))

    selected_line = Decimal(str(raw["selected_line"]))
    selected_odds = Decimal(str(raw["selected_odds"]))
    if (selected_line, selected_odds) not in offers:
        raise ValueError(f"{case_id}: selected offer must exist in offers")

    if tier == ACCEPTANCE_HOLDOUT and audit_class != AUDIT_ACCEPTANCE:
        raise ValueError(f"{case_id}: acceptance holdout must use acceptance audit class")
    if band_basis == EXPLICIT_BAND and case_id != "CAR-NOR-20260826-SHADOW":
        raise ValueError(
            f"{case_id}: only Cardiff-Norwich currently has clean recovered band+anchor evidence"
        )

    return ShadowBenchmarkCase(
        case_id=case_id,
        match=str(raw["match"]),
        source_reference=str(raw["source_reference"]),
        evidence_tier=tier,
        audit_class=audit_class,
        anchor_goal=anchor,
        assumed_total_range=(low, high),
        band_basis=band_basis,
        offers=tuple(offers),
        selected_line=selected_line,
        selected_odds=selected_odds,
        note=str(raw["note"]),
    )
