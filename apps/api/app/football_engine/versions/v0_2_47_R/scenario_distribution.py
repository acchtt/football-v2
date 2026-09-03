from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from app.model_state import get_model_state

from .market_math import normalize_goal_distribution


METHOD_ID = "RECIPROCAL_TOTAL_SCENARIO_COUNT_V1"
METHOD_STATUS = "APPROVED_ACTIVE"
CANONICAL_METHOD_MISMATCH = "CANONICAL_DISTRIBUTION_METHOD_MISMATCH"


@dataclass(frozen=True, slots=True)
class ScoreScenarioEvidence:
    home_goals: int
    away_goals: int
    label: str
    weight: Decimal

    @property
    def total_goals(self) -> int:
        return self.home_goals + self.away_goals


@dataclass(frozen=True, slots=True)
class TotalGoalScenarioEvidence:
    """A totals-only representation of one already-supplied scenario.

    This does not generate a total-goal forecast. It only removes home/away identity
    when the downstream Asian-total calculation depends exclusively on total goals.
    Duplicate totals are intentionally preserved because Method C weights scenarios,
    not unique integer outcomes.
    """

    total_goals: int
    label: str
    weight: Decimal


@dataclass(frozen=True, slots=True)
class ScenarioDistributionResult:
    method_id: str
    scenarios: tuple[ScoreScenarioEvidence, ...]
    distribution: dict[int, Decimal]
    production_ready: bool = True
    blocker: None = None


@dataclass(frozen=True, slots=True)
class TotalGoalScenarioDistributionResult:
    method_id: str
    scenarios: tuple[TotalGoalScenarioEvidence, ...]
    distribution: dict[int, Decimal]
    production_ready: bool = True
    blocker: None = None


def build_scenario_distribution(
    primary_scores: Sequence[Sequence[int]],
    *,
    upside_scores: Sequence[Sequence[int]] = (),
) -> ScenarioDistributionResult:
    """Build the approved non-Poisson distribution from explicit score scenarios.

    Approved Method C:
      - every primary scoreline has weight 1;
      - every upside scoreline has weight 1 / total recorded scenario count;
      - aggregate identical total-goal outcomes and normalize;
      - never invent scorelines, smoothing mass, or Poisson tails.

    Activation authority comes only from canonical MODEL_STATE.json. This adapter does
    not generate score scenarios; runtime must supply explicit primary/upside scenarios
    from the separately approved upstream producer once that producer exists.
    """
    _assert_method_active()
    primary_weight, upside_weight = _scenario_weights(
        len(primary_scores),
        len(upside_scores),
    )

    scenarios: list[ScoreScenarioEvidence] = []
    for score in primary_scores:
        home, away = _parse_score_pair(score)
        scenarios.append(
            ScoreScenarioEvidence(
                home_goals=home,
                away_goals=away,
                label="primary",
                weight=primary_weight,
            )
        )

    for score in upside_scores:
        home, away = _parse_score_pair(score)
        scenarios.append(
            ScoreScenarioEvidence(
                home_goals=home,
                away_goals=away,
                label="upside",
                weight=upside_weight,
            )
        )

    totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for scenario in scenarios:
        totals[scenario.total_goals] += scenario.weight

    return ScenarioDistributionResult(
        method_id=METHOD_ID,
        scenarios=tuple(scenarios),
        distribution=normalize_goal_distribution(totals),
    )


def build_total_goal_scenario_distribution(
    primary_totals: Sequence[int],
    *,
    upside_totals: Sequence[int] = (),
) -> TotalGoalScenarioDistributionResult:
    """Build Method C directly from explicit integer total-goal scenarios.

    This is representation-equivalent to ``build_scenario_distribution`` after
    scorelines have been collapsed to totals. It is deliberately *not* an upstream
    producer: callers must provide every primary/upside total explicitly. No band is
    expanded, no anchor is repeated, and no missing tail is synthesized here.

    This seam lets a future approved producer operate on total-goal scenarios without
    fabricating whether a three-goal outcome is 2-1, 1-2, or 3-0.
    """
    _assert_method_active()
    primary_weight, upside_weight = _scenario_weights(
        len(primary_totals),
        len(upside_totals),
    )

    scenarios: list[TotalGoalScenarioEvidence] = []
    for total in primary_totals:
        scenarios.append(
            TotalGoalScenarioEvidence(
                total_goals=_parse_total_goal(total),
                label="primary",
                weight=primary_weight,
            )
        )

    for total in upside_totals:
        scenarios.append(
            TotalGoalScenarioEvidence(
                total_goals=_parse_total_goal(total),
                label="upside",
                weight=upside_weight,
            )
        )

    totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for scenario in scenarios:
        totals[scenario.total_goals] += scenario.weight

    return TotalGoalScenarioDistributionResult(
        method_id=METHOD_ID,
        scenarios=tuple(scenarios),
        distribution=normalize_goal_distribution(totals),
    )


def _assert_method_active() -> None:
    state = get_model_state()
    if (
        not state.projection.distribution_method_approved
        or state.projection.distribution_method != METHOD_ID
    ):
        raise RuntimeError(CANONICAL_METHOD_MISMATCH)


def _scenario_weights(
    primary_count: int,
    upside_count: int,
) -> tuple[Decimal, Decimal]:
    if primary_count <= 0:
        raise ValueError("At least one primary scenario is required")
    total_scenario_count = primary_count + upside_count
    primary_weight = Decimal("1")
    upside_weight = Decimal("1") / Decimal(total_scenario_count)
    return primary_weight, upside_weight


def _parse_score_pair(score: Sequence[int]) -> tuple[int, int]:
    if len(score) != 2:
        raise ValueError("Score scenarios must contain exactly [home_goals, away_goals]")
    home, away = int(score[0]), int(score[1])
    if home < 0 or away < 0:
        raise ValueError("Score-scenario goals cannot be negative")
    return home, away


def _parse_total_goal(total: int) -> int:
    parsed = int(total)
    if parsed < 0:
        raise ValueError("Total-goal scenarios cannot be negative")
    return parsed
