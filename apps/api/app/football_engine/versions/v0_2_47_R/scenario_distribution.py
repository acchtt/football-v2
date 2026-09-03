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
class ScenarioDistributionResult:
    method_id: str
    scenarios: tuple[ScoreScenarioEvidence, ...]
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
    state = get_model_state()
    if (
        not state.projection.distribution_method_approved
        or state.projection.distribution_method != METHOD_ID
    ):
        raise RuntimeError(CANONICAL_METHOD_MISMATCH)

    if not primary_scores:
        raise ValueError("At least one primary score scenario is required")

    total_scenario_count = len(primary_scores) + len(upside_scores)
    if total_scenario_count <= 0:
        raise ValueError("At least one score scenario is required")

    primary_weight = Decimal("1")
    upside_weight = Decimal("1") / Decimal(total_scenario_count)
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


def _parse_score_pair(score: Sequence[int]) -> tuple[int, int]:
    if len(score) != 2:
        raise ValueError("Score scenarios must contain exactly [home_goals, away_goals]")
    home, away = int(score[0]), int(score[1])
    if home < 0 or away < 0:
        raise ValueError("Score-scenario goals cannot be negative")
    return home, away
